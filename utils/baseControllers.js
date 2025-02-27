// Utils module
require("dotenv").config();
const { Op } = require("sequelize");
const { v4 } = require("uuid");
const AppError = require("./appError");
const catchAsync = require("./catchAsync");
const ApiFeatures = require("./apiFeature");
const s3 = require("../configs/s3");

/**
 * @class BaseController : CRUD default controller
 * @param {Object} Model - Sequelize model
 * @param {Array} [uniqueFields=[]] - Array of unique fields to check for uniqueness
 * @param {Array} [associations=[]] - Array of associated models to include in queries
 */
class BaseController {
    constructor(Model, uniqueFields = [], associations = [], imageField = null) {
        this.Model = Model;
        this.uniqueFields = Array.isArray(uniqueFields) ? uniqueFields : [];
        this.associations = associations;
        this.imageField = imageField;
    }

    // ============ Start Utility Method ============
    // Start Send response helper method
    sendResponse(res, statusCode, data, message) {
        res.status(statusCode).json({
            status: "success",
            message,
            data,
        });
    }
    // End Send response helper method

    // Start Check for existing unique fields
    async checkUniqueFields(data, excludeId = null) {
        const conflictingFields = [];

        for (const field of this.uniqueFields) {
            if (data[field]) {
                // Build query for each field
                const query = { [field]: data[field] };
                if (excludeId) {
                    query.id = { [Op.ne]: excludeId };
                }

                // Check if a record exists with this field value
                const existingRecord = await this.Model.findOne({ where: query });
                if (existingRecord) {
                    conflictingFields.push(field);
                }
            }
        }

        if (conflictingFields.length > 0) {
            // Construct a detailed error message
            const fieldsString = conflictingFields.join(", ");
            throw new AppError(`A record with this ${fieldsString} already exists`, 409);
        }
    }
    // End Check for existing unique fields

    // Start Check if a record exists by ID
    async checkRecordExists(id) {
        const record = await this.Model.findByPk(id, { include: this.associations });
        if (!record) {
            throw new AppError("No record found with this ID", 404);
        }
        return record;
    }
    // End Check if a record exists by ID
    // ============ End Utility Method ============

    // ============ Start CRUD Method  ============

    // Start Fetch all records (with ApiFeatures applied)
    getAllWithApiFeatures = async (req) => {
        // Initialize ApiFeatures with the model and query parameters
        const apiFeature = new ApiFeatures(req.query, this.Model)
            .filtering()
            .sorting()
            .limitFields()
            .pagination();

        // Count total records based on filters
        const totalRecords = await this.Model.count({
            where: apiFeature.query.where,
        });

        // Execute the query with associated models included
        const records = await apiFeature.execute({ include: this.associations });

        return { totalRecords, records };
    };

    // Default getAll method that can be overridden
    getAll = catchAsync(async (req, res, next) => {
        const { records, totalRecords } = await this.getAllWithApiFeatures(req);

        res.status(200).json({
            status: "success",
            total: totalRecords,
            results: records.length,
            data: records,
        });
    });
    // End Fetch all records

    // Start Create a new record
    createOne = catchAsync(async (req, res, next) => {
        // Check if the body is empty
        if (Object.keys(req.body).length === 0) {
            return next(new AppError("You can't create with empty fields", 400));
        }

        // Check for existing unique fields
        await this.checkUniqueFields(req.body);

        // Upload the image if present
        let imageUrl;
        if (req.file) {
            const imageFile = req.file;
            const { originalname, mimetype, buffer } = imageFile;
            const uniqueFileName = `${v4()}_${originalname}`;
            const params = {
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: `UserProfile/${uniqueFileName}`,
                Body: buffer,
                ContentType: mimetype,
            };

            // Upload the image to S3
            const s3Upload = await new Promise((resolve, reject) => {
                s3.upload(params, (err, data) => {
                    if (err) {
                        return reject(new AppError("S3 upload failed", 500));
                    }
                    resolve(data.Location);
                });
            });

            imageUrl = s3Upload;
            req.body[this.imageField] = imageUrl;
        }

        // Create the new record
        const newRecord = await this.Model.create(req.body);

        // Send the response with the new record data
        this.sendResponse(res, 201, newRecord, `${this.Model.name} successfully created`);

        return newRecord;
    });
    // End Create a new record

    // Start Fetch a single record by ID
    getOne = catchAsync(async (req, res, next) => {
        const record = await this.checkRecordExists(req.params.id);

        this.sendResponse(res, 200, record, `${this.Model.name} found`);
    });
    // End Fetch a single record by ID

    // Start Update a record by ID
    updateOne = catchAsync(async (req, res, next) => {
        const { id } = req.params;

        // Check if record exists
        const record = await this.checkRecordExists(id);

        if (!req.body || Object.keys(req.body).length === 0) {
            return next(new AppError("Nothing to update. Provide valid data.", 400));
        }

        // Check if the new data is different from the current data
        const isDataIdentical = Object.keys(req.body).every(
            (field) => req.body[field] === record[field],
        );

        if (isDataIdentical) {
            return next(new AppError("No new changes detected!", 400));
        }

        // Check for existing fields during update
        await this.checkUniqueFields(req.body, id);

        await this.Model.update(req.body, {
            where: { id },
            validate: true,
            individualHooks: true,
        });

        // Retrieve the updated record
        const updatedRecord = await this.Model.findByPk(id, { include: this.associations });

        this.sendResponse(res, 200, updatedRecord, `${this.Model.name} successfully updated`);
    });
    // End Update a record by ID

    // Start Delete a record by ID
    deleteOne = catchAsync(async (req, res, next) => {
        const { id } = req.params;
        await this.checkRecordExists(id);

        await this.Model.destroy({
            where: { id },
        });
        this.sendResponse(res, 200, null, `${this.Model.name} successfully deleted`);
    });
    // End Delete a record by ID

    // Start Delete all records
    deleteAll = catchAsync(async (req, res, next) => {
        await this.Model.destroy({
            where: {},
            truncate: false,
        });
        this.sendResponse(res, 200, null, "All Records successfully deleted.");
    });
    // End Delete all records

    // Start Update image
    updateImage = catchAsync(async (req, res, next) => {
        const imageFile = req.file;

        const record = await this.checkRecordExists(req.params.id);

        // Check if there is an image file
        if (!imageFile) {
            return next(new AppError("No image file provided. Please upload a valid image.", 400));
        }

        if (record[this.imageField]) {
            // Extract and handle the key for the old image
            const oldUrl = record[this.imageField].replace(/\+/g, "%20");
            const deleteKey = decodeURIComponent(oldUrl.split("/").slice(-2).join("/"));

            const deleteParams = {
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: deleteKey,
            };

            await s3
                .deleteObject(deleteParams)
                .promise()
                .catch((err) => {
                    return next(new AppError("Failed to delete old image from S3", 500, err));
                });
        }

        // Upload the new image to S3
        const { originalname, mimetype, buffer } = imageFile;
        const uniqueFileName = `${v4()}_${originalname}`;
        const uploadParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `UserProfile/${uniqueFileName}`,
            Body: buffer,
            ContentType: mimetype,
        };

        try {
            const data = await s3.upload(uploadParams).promise();
            const { Location: url } = data;

            // Update user profile with the new image URL
            record[this.imageField] = url;
            await record.save();

            return res.status(200).json({
                message: "Profile image successfully updated",
                record,
            });
        } catch (err) {
            return next(new AppError("Failed to upload new image to S3", 500, err));
        }
    });
    // End Update image

    // Start Delete image
    deleteImage = catchAsync(async (req, res, next) => {
        const { id } = req.params;

        // Check if the record exists
        const record = await this.checkRecordExists(id);

        // Ensure the image field is present
        if (!record[this.imageField]) {
            return next(new AppError("No image associated with this record", 404));
        }

        // Extract the key and handle special characters
        const url = record[this.imageField].replace(/\+/g, "%20");
        const key = decodeURIComponent(url.split("/").slice(-2).join("/"));
        // Prepare S3 delete parameters
        const params = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: key, // Use the extracted key
        };

        // Attempt to delete the image from S3
        const result = await s3
            .deleteObject(params)
            .promise()
            .catch((err) => {
                return next(new AppError("Failed to delete image from S3", 500, err));
            });

        // Set the image field to null or delete the field as per your requirement
        record[this.imageField] = null;
        await record.save();
        this.sendResponse(res, 200, null, "Image successfully deleted");
    });

    // End Delete image

    // ============ End CRUD Method  ============
}

module.exports = BaseController;

//BadgeClasses.js model
const { DataTypes } = require("sequelize");
const sequelize = require("../configs/database");

const BadgeClasses = sequelize.define(
    "BadgeClasses",
    {
        id: {
            autoIncrement: true,
            primaryKey: true,
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        name: {
            type: DataTypes.STRING,
            validate: {
                notEmpty: {
                    msg: "Name cannot be empty",
                },
                len: {
                    args: [3, 150],
                    msg: "Name must be between 3 and 150 characters long",
                },
            },
        },
        description: {
            type: DataTypes.STRING,
            validate: {
                len: {
                    args: [0, 255],
                    msg: "Description cannot exceed 255 characters",
                },
            },
        },
        imageUrl: {
            type: DataTypes.STRING,
        },
        issuerId: {
            type: DataTypes.INTEGER,
            references: {
                model: "Issuers",
                key: "id",
                onDelete: "CASCADE",
                onUpdate: "CASCADE",
            },
        },
        tags: {
            type: DataTypes.STRING,
        },
        startedDate: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        endDate: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        expiredDate: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        duration: {
            type: DataTypes.DATE,
            get() {
                const startDate = this.getDataValue("startedDate");
                const endDate = this.getDataValue("endDate");
                if (startDate && endDate) {
                    return endDate - startDate;
                }
                return null;
            },
        },
        institutionId: {
            type: DataTypes.INTEGER,
            references: {
                model: "Institutions",
                key: "id",
                onDelete: "CASCADE",
                onUpdate: "CASCADE",
            },
        },
    },
    {
        timestamps: true,
    },
    {
        indexes: [
            {
                unique: true,
                fields: ["name"],
            },
        ],
    },
);

module.exports = BadgeClasses;

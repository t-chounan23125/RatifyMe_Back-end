require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const ServicePlans = require('../../models/ServicePlans')

const catchAsync = require("../../utils/catchAsync");
const AppError = require("../../utils/appError");

// POST request to create Stripe Checkout session
exports.createCheckoutSession = catchAsync(async (req, res, next) => {
    const { institutionId } = req.body;
    const { servicePlanId } = req.params;
    // Fetch the price ID from the database
    const servicePlan = await ServicePlans.findByPk(servicePlanId);
    if (!servicePlan) {
        return next(new AppError('Service Plan not found', 404));
    }
    // console.log(servicePlan);

    const priceId = servicePlan.stripePriceId; // Ensure this is the correct field
    if (!priceId) {
        return next(new AppError('Price ID not found for the service plan', 400));
    }

    // Create the Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${process.env.BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.BASE_URL}/cancel`,
        // Attach any custom data to the session
        metadata: {
            institutionId,
            servicePlanId,
        }
    });

    // Respond with the session ID so client can redirect
    res.status(200).json({ sessionId: session.id });
});


exports.getSession = catchAsync(async (req, res, next) => {
    const servicePlanId = req.params.id
})
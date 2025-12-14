import Stripe from "stripe";
import Cors from "cors";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// CORS для Webflow
const cors = Cors({
  methods: ["POST"],
  origin: process.env.FRONTEND_URL
});

function runCors(req, res) {
  return new Promise((resolve, reject) => {
    cors(req, res, result => {
      if (result instanceof Error) reject(result);
      resolve(result);
    });
  });
}

export default async function handler(req, res) {
  await runCors(req, res);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { amount, email, type } = req.body;

    if (!amount || amount < 1) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: type === "monthly" ? "subscription" : "payment",
      customer_email: email,
      success_url: `${process.env.FRONTEND_URL}/thank-you`,
      cancel_url: `${process.env.FRONTEND_URL}/donate`,
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name:
                type === "monthly"
                  ? "Ежемесячное пожертвование"
                  : "Разовое пожертвование"
            },
            unit_amount: amount * 100,
            ...(type === "monthly" && {
              recurring: { interval: "month" }
            })
          },
          quantity: 1
        }
      ]
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Stripe error" });
  }
}
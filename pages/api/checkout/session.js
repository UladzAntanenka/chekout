import Stripe from "stripe";
import Cors from "cors";

// Проверка наличия Stripe ключа
if (!process.env.STRIPE_SECRET_KEY) {
  console.error("STRIPE_SECRET_KEY is not set");
}

const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

// CORS для Webflow
const cors = Cors({
  methods: ["POST", "OPTIONS"],
  origin: process.env.FRONTEND_URL || "*",
  credentials: true
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
  // Обработка OPTIONS для CORS preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  await runCors(req, res);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Проверка наличия Stripe
  if (!stripe) {
    console.error("Stripe is not initialized");
    return res.status(500).json({ error: "Server configuration error" });
  }

  try {
    const { amount, email, type } = req.body;

    // Валидация суммы
    if (!amount || amount < 1) {
      return res.status(400).json({ error: "Invalid amount. Minimum is 1 EUR" });
    }

    // Валидация email
    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Valid email is required" });
    }

    // Валидация типа доната
    const donationType = type === "monthly" ? "monthly" : "one-time";
    const isSubscription = donationType === "monthly";

    // Получаем базовый URL (убираем путь если есть)
    const baseUrl = process.env.FRONTEND_URL 
      ? process.env.FRONTEND_URL.split('/').slice(0, 3).join('/') // Берем только протокол + домен
      : "https://volnyja.webflow.io";

    const session = await stripe.checkout.sessions.create({
      mode: isSubscription ? "subscription" : "payment",
      customer_email: email,
      success_url: `${baseUrl}/thank-you?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/stripe-test`, // или /donate, в зависимости от вашей страницы
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: isSubscription
                ? "Ежемесячное пожертвование"
                : "Разовое пожертвование",
              description: `Пожертвование на сумму ${amount} EUR`
            },
            unit_amount: Math.round(amount * 100), // Конвертируем в центы
            ...(isSubscription && {
              recurring: { interval: "month" }
            })
          },
          quantity: 1
        }
      ],
      metadata: {
        donation_type: donationType,
        amount: amount.toString()
      }
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("Stripe error:", err);
    res.status(500).json({ 
      error: "Stripe error",
      message: err.message 
    });
  }
}
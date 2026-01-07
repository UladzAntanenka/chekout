import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": process.env.FRONTEND_URL || "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default async function handler(req, res) {
  // Установка CORS headers
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  // Обработка preflight запросов
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Только POST запросы
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { amount, email, type } = req.body;

    // Валидация
    if (!amount || amount < 1) {
      return res.status(400).json({ error: "Некорректная сумма" });
    }

    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Некорректный email" });
    }

    if (!["monthly", "one-time"].includes(type)) {
      return res.status(400).json({ error: "Некорректный тип платежа" });
    }

    // Создание Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: type === "monthly" ? "subscription" : "payment",
      customer_email: email,
      success_url: `${process.env.FRONTEND_URL}/thank-you?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/donate`,
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name:
                type === "monthly"
                  ? "Ежемесячное пожертвование"
                  : "Разовое пожертвование",
            },
            unit_amount: Math.round(amount * 100),
            ...(type === "monthly" && {
              recurring: { interval: "month" },
            }),
          },
          quantity: 1,
        },
      ],
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("Stripe error:", err);
    return res.status(500).json({
      error: "Ошибка обработки платежа",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
}
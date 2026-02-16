import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Функция для получения разрешённых origin
const getAllowedOrigins = () => {
  const frontendUrl = process.env.FRONTEND_URL;
  if (!frontendUrl) return ["*"];
  
  const origins = [frontendUrl];
  
  // Добавляем вариант без www
  if (frontendUrl.includes("www.")) {
    origins.push(frontendUrl.replace("www.", ""));
  } else {
    // Добавляем вариант с www
    origins.push(frontendUrl.replace("https://", "https://www."));
  }
  
  return origins;
};

const allowedOrigins = getAllowedOrigins();

export default async function handler(req, res) {
  // Динамическая установка CORS headers
  const origin = req.headers.origin;
  
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else if (allowedOrigins.includes("*")) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Обработка preflight запросов
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Только POST запросы
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { amount, email, type, returnUrl, locale } = req.body;

    // ВРЕМЕННО ДЛЯ ОТЛАДКИ
    console.log('=== DEBUG START ===');
    console.log('Received returnUrl:', returnUrl);
    console.log('Locale:', locale);
    console.log('Full request body:', req.body);

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

    // Определяем правильный URL для редиректа
    const baseUrl = origin && allowedOrigins.includes(origin) 
      ? origin 
      : process.env.FRONTEND_URL;

    // Используем returnUrl если он есть, иначе дефолтный
    const cancelUrl = returnUrl || `${baseUrl}/donate`;

    // Переводы для Stripe
    const productNames = {
      en: {
        monthly: 'Monthly donation',
        oneTime: 'One-time donation'
      },
      be: {
        monthly: 'Ежемесячное пожертвование',
        oneTime: 'Разовое пожертвование'
      }
    };

    const lang = locale === 'en' ? 'en' : 'be';
    
    console.log('Using cancelUrl:', cancelUrl);
    console.log('Language:', lang);
    console.log('=== DEBUG END ===');

    // Создание Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: type === "monthly" ? "subscription" : "payment",
      customer_email: email,
      locale: locale === 'en' ? 'en' : 'auto',
      success_url: `${baseUrl}/thank-you?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: type === "monthly" 
                ? productNames[lang].monthly 
                : productNames[lang].oneTime
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
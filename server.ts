import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";

import { initialData } from "./src/data/db";

console.log(`[Server] Loading server.ts (VERCEL: ${!!process.env.VERCEL}, NODE_ENV: ${process.env.NODE_ENV})`);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONGODB_URI = process.env.MONGODB_URI;

// MongoDB Schemas
const ProductSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: String,
  pinduoduoPrice: Number,
  oldPrice: Number,
  description: String,
  category: String,
  images: [String],
  videos: [String],
  sizes: [String],
  rating: Number,
  salesCount: Number,
  seller: Object,
  isOriginal: Boolean,
  isCheapPrice: Boolean,
  isFlashSale: Boolean,
  flashSaleEnd: Number,
  weight: Number,
  reviews: [Object]
}, { timestamps: true });

const UserSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  telegramId: String,
  username: String,
  avatar: String,
  balance: Number,
  referralBalance: Number,
  invitedCount: Number,
  bio: String,
  isAdmin: Boolean,
  wishlist: [String]
}, { timestamps: true });

const OrderSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: String,
  username: String,
  productId: String,
  productName: String,
  price: Number,
  status: String,
  address: String,
  receiptImage: String,
  trackNumber: String,
  date: String
}, { timestamps: true });

const BannerSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: String,
  subtitle: String,
  image: String,
  link: String
}, { timestamps: true });

interface IProduct extends mongoose.Document { id: string; [key: string]: any; }
interface IUser extends mongoose.Document { id: string; [key: string]: any; }
interface IOrder extends mongoose.Document { id: string; [key: string]: any; }
interface IBanner extends mongoose.Document { id: string; [key: string]: any; }
interface IData extends mongoose.Document { key: string; data: any; }

const ProductModel = mongoose.models.Product || mongoose.model<IProduct>('Product', ProductSchema);
const UserModel = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
const OrderModel = mongoose.models.Order || mongoose.model<IOrder>('Order', OrderSchema);
const BannerModel = mongoose.models.Banner || mongoose.model<IBanner>('Banner', BannerSchema);
const DataModel = mongoose.models.Data || mongoose.model<IData>('Data', new mongoose.Schema({ key: String, data: Object }));

// Initial data structure
const getInitialData = () => initialData;

// Cache for in-memory data
let cachedData: any = null;

// Ensure MongoDB is connected before operations
const ensureConnection = async () => {
  const uri = process.env.MONGODB_URI || MONGODB_URI;
  const isValidMongo = uri && (uri.startsWith('mongodb://') || uri.startsWith('mongodb+srv://'));
  
  if (!isValidMongo) {
    console.log('MongoDB URI is missing or invalid format');
    return false;
  }
  
  if (mongoose.connection.readyState === 1) return true;
  
  try {
    console.log('Attempting to connect to MongoDB with URI starting with:', uri.substring(0, 15));
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      family: 4 // Use IPv4
    });
    console.log('Successfully connected to MongoDB');
    return true;
  } catch (e) {
    console.error('MongoDB connection error details:', e);
    return false;
  }
};

// Load data from MongoDB
const loadData = async () => {
  const isConnected = await ensureConnection();
  let dataFromDB: any = null;

  if (isConnected) {
    try {
      const products = await ProductModel.find().lean() || [];
      const users = await UserModel.find().lean() || [];
      const orders = await OrderModel.find().lean() || [];
      const banners = await BannerModel.find().lean() || [];
      
      // Fetch other collections from DataModel or separate models if they exist
      const mainStore = await DataModel.findOne({ key: 'main_store' }).lean();
      const extraData = mainStore?.data || {};

      dataFromDB = {
        products,
        users,
        orders,
        banners,
        promoCodes: extraData.promoCodes || [],
        partnerships: extraData.partnerships || [],
        wishlists: extraData.wishlists || {},
        supportMessages: extraData.supportMessages || []
      };
    } catch (e) {
      console.error('MongoDB load error:', e);
    }
  }

  if (dataFromDB && (dataFromDB.products.length > 0 || dataFromDB.users.length > 0)) {
    cachedData = dataFromDB;
    return cachedData;
  }

  if (cachedData) return cachedData;

  // If DB is empty or disconnected, use initial data
  cachedData = initialData;
  
  // If DB is connected but empty, seed it with initial data
  if (isConnected) {
    console.log('Seeding new MongoDB with initial data...');
    saveData(cachedData);
  }
  
  return cachedData;
};

// Save data to MongoDB
const saveData = async (data: any) => {
  cachedData = data;
  const isConnected = await ensureConnection();
  if (isConnected) {
    try {
      // Save products individually
      if (data.products) {
        for (const p of data.products) {
          await ProductModel.findOneAndUpdate({ id: p.id }, p, { upsert: true });
        }
      }
      // Save users individually
      if (data.users) {
        for (const u of data.users) {
          await UserModel.findOneAndUpdate({ id: u.id }, u, { upsert: true });
        }
      }
      // Save orders individually
      if (data.orders) {
        for (const o of data.orders) {
          await OrderModel.findOneAndUpdate({ id: o.id }, o, { upsert: true });
        }
      }
      // Save banners individually
      if (data.banners) {
        for (const b of data.banners) {
          await BannerModel.findOneAndUpdate({ id: b.id }, b, { upsert: true });
        }
      }
      
      // Save extra data (promoCodes, partnerships, etc.) in a single document for simplicity
      // or you could create separate models for them.
      await DataModel.findOneAndUpdate(
        { key: 'main_store' },
        { 
          key: 'main_store',
          data: {
            promoCodes: data.promoCodes || [],
            partnerships: data.partnerships || [],
            wishlists: data.wishlists || {},
            supportMessages: data.supportMessages || []
          }
        },
        { upsert: true }
      );
    } catch (e) {
      console.error('MongoDB save error:', e);
    }
  }
};

console.log(`[Server] Starting initialization...`);
export const app = express();
console.log(`[Server] Express app created`);

// Health check
app.get("/ping", (req, res) => res.send("pong"));

// Middleware
app.use((req, res, next) => {
  if (process.env.VERCEL) {
    console.log(`[Vercel] Request: ${req.method} ${req.url}`);
  }
  next();
});
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Connect to MongoDB if URI is provided
const uri = process.env.MONGODB_URI || MONGODB_URI;
const isValidMongo = uri && (uri.startsWith('mongodb://') || uri.startsWith('mongodb+srv://'));
if (isValidMongo) {
  try {
    mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    }).then(() => console.log('Connected to MongoDB'))
      .catch(e => console.error('Initial MongoDB connection error:', e));
  } catch (e) {
    console.error('MongoDB connection setup error:', e);
  }
}

// API: Sync data to MongoDB
app.post("/api/sync", async (req, res) => {
  try {
    const data = req.body;
    if (!data || !data.products) {
      return res.status(400).json({ error: "Noto'g'ri ma'lumotlar formati" });
    }
    
    await saveData(data);
    console.log(`[Server] Data synced to MongoDB`);
    res.json({ success: true, message: "Ma'lumotlar bazaga muvaffaqiyatli sinxronizatsiya qilindi." });
  } catch (e: any) {
    console.error('[Server] Sync error:', e);
    res.status(500).json({ error: e.message });
  }
});

// API: Get all data
app.get("/api/data", async (req, res) => {
    try {
      const data = await loadData();
      res.json(data);
    } catch (e) {
      res.json(getInitialData());
    }
  });

  // API: Get DB Status
  app.get("/api/db-status", async (req, res) => {
    const isConnected = await ensureConnection();
    const data = await loadData();
    res.json({ 
      connected: isConnected,
      usingMongo: !!MONGODB_URI,
      productCount: data.products?.length || 0,
      readyState: mongoose.connection.readyState,
      env_uri_exists: !!process.env.MONGODB_URI
    });
  });

  // API: Debug DB (returns error details if any)
  app.get("/api/debug-db", async (req, res) => {
    try {
      const isConnected = await ensureConnection();
      const uri = process.env.MONGODB_URI || '';
      
      if (!isConnected) {
        const uriMissing = !MONGODB_URI;
        const uriInvalid = MONGODB_URI && !MONGODB_URI.startsWith('mongodb');
        return res.json({ 
          status: "Disconnected",
          error: uriMissing ? "MONGODB_URI kodi kiritilmagan (Environment Variable)" : (uriInvalid ? "MONGODB_URI kodi formati noto'g'ri" : "MongoDB ulanishda xatolik (IP Whitelist tekshiring)"), 
          uri_exists: !!MONGODB_URI,
          uri_prefix: uri ? uri.substring(0, 15) + "..." : "none",
          readyState: mongoose.connection.readyState
        });
      }
      
      const productCount = await ProductModel.countDocuments();
      const userCount = await UserModel.countDocuments();
      const orderCount = await OrderModel.countDocuments();
      const bannerCount = await BannerModel.countDocuments();
      
      res.json({ 
        status: "Connected", 
        counts: {
          products: productCount,
          users: userCount,
          orders: orderCount,
          banners: bannerCount
        },
        uri_prefix: uri.substring(0, 15) + "..."
      });
    } catch (e: any) {
      res.json({ status: "Error", error: e.message, stack: e.stack });
    }
  });

  // API: Export data (for manual backup to code)
  app.get("/api/export", async (req, res) => {
    try {
      const data = await loadData();
      res.json({
        products: data.products,
        banners: data.banners
      });
    } catch (e) {
      res.status(500).json({ error: "Export failed" });
    }
  });

  // API: Partnership request
  app.post("/api/partnerships", async (req, res) => {
    const data = await loadData();
    const newRequest = { ...req.body, id: `PART-${Date.now()}`, status: 'pending', date: new Date().toISOString() };
    data.partnerships.push(newRequest);
    await saveData(data);
    res.json({ success: true, request: newRequest });
  });

  // API: Update partnership (Admin only)
  app.post("/api/partnerships/update", async (req, res) => {
    const data = await loadData();
    const { id, status } = req.body;
    const index = data.partnerships.findIndex((p: any) => p.id === id);
    if (index > -1) {
      data.partnerships[index].status = status;
      
      // If approved, generate 50 promo codes
      if (status === 'approved') {
        const userId = data.partnerships[index].userId;
        const type = data.partnerships[index].type; // '40' or '55'
        const discount = type === '40' ? 0.4 : 0.55;
        
        for (let i = 0; i < 50; i++) {
          const code = Math.random().toString(36).substring(2, 8).toUpperCase();
          data.promoCodes.push({
            id: `PROMO-${Date.now()}-${i}`,
            code,
            discount,
            ownerId: userId,
            isUsed: false,
            usedBy: null
          });
        }
      }
      
      await saveData(data);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Request not found" });
    }
  });

  // API: Wishlist toggle
  app.post("/api/wishlist/toggle", async (req, res) => {
    const data = await loadData();
    const { userId, productId } = req.body;
    if (!data.wishlists[userId]) data.wishlists[userId] = [];
    
    const index = data.wishlists[userId].indexOf(productId);
    if (index > -1) {
      data.wishlists[userId].splice(index, 1);
    } else {
      data.wishlists[userId].push(productId);
    }
    
    await saveData(data);
    res.json({ success: true, wishlist: data.wishlists[userId] });
  });

  // API: Support messages
  app.post("/api/support", async (req, res) => {
    const data = await loadData();
    const newMessage = { ...req.body, id: `MSG-${Date.now()}`, date: new Date().toISOString() };
    data.supportMessages.push(newMessage);
    await saveData(data);
    res.json({ success: true });
  });

  // API: Force DB Sync (Admin only)
  app.post("/api/admin/force-db-sync", async (req, res) => {
    try {
      const data = await loadData();
      await saveData(data);
      res.json({ success: true, productCount: data.products.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // API: Update products (Admin only)
  app.post("/api/products", async (req, res) => {
    const data = await loadData();
    const newProduct = req.body;
    const existingIndex = data.products.findIndex((p: any) => p.id === newProduct.id);
    if (existingIndex > -1) {
      data.products[existingIndex] = newProduct;
    } else {
      data.products.push(newProduct);
    }
    await saveData(data);
    res.json({ success: true });
  });

  // API: Delete product (Admin only)
  app.delete("/api/products/:id", async (req, res) => {
    const data = await loadData();
    const { id } = req.params;
    data.products = data.products.filter((p: any) => p.id !== id);
    await saveData(data);
    res.json({ success: true });
  });

  // API: Update banners (Admin only)
  app.post("/api/banners", async (req, res) => {
    const data = await loadData();
    data.banners = req.body;
    await saveData(data);
    res.json({ success: true });
  });

  // API: Register/Update user
  app.post("/api/users", async (req, res) => {
    const data = await loadData();
    const newUser = req.body;
    const existingIndex = data.users.findIndex((u: any) => u.phoneNumber === newUser.phoneNumber);
    if (existingIndex > -1) {
      data.users[existingIndex] = { ...data.users[existingIndex], ...newUser };
    } else {
      data.users.push(newUser);
    }
    await saveData(data);
    res.json({ success: true, user: newUser });
  });

  // API: Use promo code
  app.post("/api/promo/use", async (req, res) => {
    const data = await loadData();
    const { code } = req.body;
    const promoIndex = data.promoCodes.findIndex((p: any) => p.code.toUpperCase() === code.toUpperCase());
    if (promoIndex > -1) {
      const promo = data.promoCodes[promoIndex];
      data.promoCodes[promoIndex].isUsed = true;
      
      // Reward the owner
      const ownerIndex = data.users.findIndex((u: any) => u.telegramId === promo.ownerId);
      if (ownerIndex > -1) {
        // Reward owner with 20,000 UZS per use
        data.users[ownerIndex].referralBalance = (data.users[ownerIndex].referralBalance || 0) + 20000;
      }
      
      await saveData(data);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Promo code not found" });
    }
  });

  // API: Create order
  app.post("/api/orders", async (req, res) => {
    const data = await loadData();
    const newOrder = { ...req.body, id: `ORD-${Date.now()}` };
    data.orders.push(newOrder);
    await saveData(data);
    res.json({ success: true, order: newOrder });
  });

  // API: Update order (Status and Track Number)
  app.post("/api/orders/update", async (req, res) => {
    const data = await loadData();
    const { id, status, trackNumber } = req.body;
    const orderIndex = data.orders.findIndex((o: any) => o.id === id);
    if (orderIndex > -1) {
      data.orders[orderIndex] = { ...data.orders[orderIndex], status, trackNumber };
      await saveData(data);
      res.json({ success: true, order: data.orders[orderIndex] });
    } else {
      res.status(404).json({ error: "Order not found" });
    }
  });

  // API: Delete order
  app.delete("/api/orders/:id", async (req, res) => {
    const data = await loadData();
    const { id } = req.params;
    data.orders = data.orders.filter((o: any) => o.id !== id);
    await saveData(data);
    res.json({ success: true });
  });

  // API: Notify Admin via Telegram
  app.post("/api/notify", async (req, res) => {
    const { message, chatId } = req.body;
    const token = process.env.TELEGRAM_TOKEN || '8543158894:AAHkaN83tLCgNrJ-Omutn744aTui784GScc';
    const targetChatId = chatId || '8215056224';
    
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: targetChatId, text: message, parse_mode: 'Markdown' })
      });
      const data = await response.json();
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: "Failed to send notification" });
    }
  });

  // API: Add referral bonus
  app.post("/api/referral/add", async (req, res) => {
    const data = await loadData();
    const { referrerId, amount } = req.body;
    const userIndex = data.users.findIndex((u: any) => u.telegramId === referrerId || u.phoneNumber === referrerId);
    if (userIndex > -1) {
      data.users[userIndex].referralBalance = (data.users[userIndex].referralBalance || 0) + amount;
      data.users[userIndex].invitedCount = (data.users[userIndex].invitedCount || 0) + 1;
      await saveData(data);
      res.json({ success: true, user: data.users[userIndex] });
    } else {
      res.status(404).json({ error: "Referrer not found" });
    }
  });

  // API: Add review to product
  app.post("/api/products/:id/reviews", async (req, res) => {
    const data = await loadData();
    const { id } = req.params;
    const review = { ...req.body, id: `REV-${Date.now()}`, date: new Date().toISOString().split('T')[0] };
    
    const productIndex = data.products.findIndex((p: any) => p.id === id);
    if (productIndex > -1) {
      if (!data.products[productIndex].reviews) {
        data.products[productIndex].reviews = [];
      }
      data.products[productIndex].reviews.unshift(review);
      
      // Update product rating
      const reviews = data.products[productIndex].reviews;
      const avgRating = reviews.reduce((acc: number, r: any) => acc + r.rating, 0) / reviews.length;
      data.products[productIndex].rating = Number(avgRating.toFixed(1));
      
      await saveData(data);
      res.json({ success: true, review });
    } else {
      res.status(404).json({ error: "Product not found" });
    }
  });

// 404 Handler for API
app.use('/api/*', (req, res) => {
  res.status(404).json({ 
    error: `API yo'nalishi topilmadi: ${req.method} ${req.originalUrl || req.url}`,
    path: req.path,
    url: req.url
  });
});

// Global Error Handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error('Express Error:', err);
  res.status(500).json({ 
    error: 'Serverda ichki xatolik yuz berdi',
    message: err.message 
  });
});

// Vite middleware for development
if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else if (process.env.NODE_ENV === "production" && !process.env.VERCEL) {
  app.use(express.static(path.join(__dirname, "dist")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "dist", "index.html"));
  });
}

// Start server
if (!process.env.VERCEL) {
  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Server running on http://0.0.0.0:${PORT}`);
  });
}

export default app;

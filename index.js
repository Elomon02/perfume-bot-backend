import 'dotenv/config';
import { Telegraf } from 'telegraf';
import express from 'express';
import mongoose from 'mongoose';

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI).then(() => console.log('DB ulandi'));

// === MODELLAR ===
const Product = mongoose.model('Product', new mongoose.Schema({
  name: String,
  description: String,
  imageId: String
}));

const Cart = mongoose.model('Cart', new mongoose.Schema({
  userId: Number,
  productId: String,
  quantity: Number
}, { _id: false }));

const Order = mongoose.model('Order', new mongoose.Schema({
  userId: Number,
  name: String,
  address: String,
  phone: String,
  products: String
}));

// === ADMIN KOMANDALARI ===
let adminState = {};
const ADMIN = parseInt(process.env.ADMIN_ID);

bot.command('add', async (ctx) => {
  if (ctx.from.id !== ADMIN) return;
  adminState[ctx.from.id] = { action: 'add', step: 'name' };
  ctx.reply('Mahsulot nomini yuboring:');
});

bot.command('edit', async (ctx) => {
  if (ctx.from.id !== ADMIN) return;
  const products = await Product.find();
  const keyboard = products.map(p => [{ text: p.name, callback_data: `edit_${p._id}` }]);
  ctx.reply('Tahrirlash uchun mahsulotni tanlang:', { reply_markup: { inline_keyboard: keyboard } });
});

bot.command('delete', async (ctx) => {
  if (ctx.from.id !== ADMIN) return;
  const products = await Product.find();
  const keyboard = products.map(p => [{ text: p.name, callback_data: `del_${p._id}` }]);
  ctx.reply('O\'chirish uchun mahsulotni tanlang:', { reply_markup: { inline_keyboard: keyboard } });
});

// === CALLBACK ===
bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;
  if (data.startsWith('edit_')) {
    const id = data.split('_')[1];
    adminState[ctx.from.id] = { action: 'edit', id, step: 'name' };
    ctx.reply('Yangi nomni yuboring:');
  } else if (data.startsWith('del_')) {
    const id = data.split('_')[1];
    await Product.deleteOne({ _id: id });
    ctx.reply('Mahsulot o\'chirildi');
  }
  ctx.answerCbQuery();
});

// === MATN VA RASMLAR ===
bot.on('text', async (ctx) => {
  const state = adminState[ctx.from.id];
  if (!state || ctx.from.id !== ADMIN) return;

  if (state.step === 'name') {
    state.name = ctx.message.text;
    state.step = 'desc';
    ctx.reply('Tavsif yuboring:');
  } else if (state.step === 'desc') {
    state.desc = ctx.message.text;
    state.step = 'photo';
    ctx.reply('Rasm yuboring:');
  }
});

bot.on('photo', async (ctx) => {
  const state = adminState[ctx.from.id];
  if (!state || ctx.from.id !== ADMIN) return;

  const fileId = ctx.message.photo.pop().file_id;

  if (state.action === 'add') {
    await Product.create({ name: state.name, description: state.desc, imageId: fileId });
    ctx.reply('Mahsulot qo\'shildi');
  } else if (state.action === 'edit') {
    await Product.updateOne({ _id: state.id }, { name: state.name, description: state.desc, imageId: fileId });
    ctx.reply('Mahsulot tahrirlandi');
  }

  delete adminState[ctx.from.id];
});

// === /start ===
bot.start((ctx) => {
  ctx.reply('Do\'konimizga xush kelibsiz!', {
    reply_markup: {
      inline_keyboard: [[
        { text: 'Mahsulotlar', web_app: { url: process.env.MINI_APP_URL } }
      ]]
    }
  });
});

// === WebApp ma'lumotlari ===
bot.on('web_app_data', async (ctx) => {
  const data = JSON.parse(ctx.webAppData.data);
  const userId = ctx.from.id;

  if (data.action === 'add_to_cart') {
    await Cart.updateOne(
      { userId, productId: data.id },
      { quantity: data.qty },
      { upsert: true }
    );
    ctx.reply('Savatchaga qo\'shildi');
  }

  if (data.action === 'order') {
    const cart = await Cart.find({ userId }).populate('productId');
    if (cart.length === 0) return ctx.reply('Savatcha bo\'sh!');

    const products = cart.map(c => `${c.productId.name} × ${c.quantity}`).join('\n');
    await Order.create({
      userId, name: data.name, address: data.address, phone: data.phone,
      products
    });

    await bot.telegram.sendMessage(ADMIN, `
Yangi buyurtma!

Ism: ${data.name}
Manzil: ${data.address}
Tel: ${data.phone}

Mahsulotlar:
${products}
    `);

    await Cart.deleteMany({ userId });
    ctx.reply('Buyurtmangiz qabul qilindi!');
  }
});

// === API ===
app.get('/api/products', async (req, res) => {
  const products = await Product.find();
  res.json(products);
});

app.listen(3000, () => {
  console.log('Server: http://localhost:3000');
  bot.launch();
  console.log('Bot ishga tushdi');
});
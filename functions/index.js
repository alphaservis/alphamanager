// functions/index.js
const functions = require('firebase-functions');
const express = require('express');
const cors = require('cors');
const WooCommerceRestApi = require('@woocommerce/woocommerce-rest-api').default;
const admin = require('firebase-admin'); // Dodan Firebase Admin SDK

// Inicijalizacija Firebase Admin SDK-a
// Admin SDK se koristi za provjeru ID tokena
admin.initializeApp();

const app = express();
app.use(express.json());
app.use(cors({ origin: true }));

const wooApi = new WooCommerceRestApi({
  url: functions.config().woocommerce.store_url,
  consumerKey: functions.config().woocommerce.consumer_key,
  consumerSecret: functions.config().woocommerce.consumer_secret,
  version: 'wc/v3',
  queryStringAuth: true,
});

// Health check endpoint (OBVEZAN za Cloud Run)
// Cloud Run koristi ovo za provjeru je li kontejner spreman
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Middleware za provjeru Firebase ID tokena
const authenticate = async (req, res, next) => {
  if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
    console.error('Nema Firebase ID tokena ili je pogrešnog formata.');
    return res.status(403).json({ error: 'Neautorizirano. Potreban je Firebase ID token.' });
  }

  const idToken = req.headers.authorization.split('Bearer ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken; // Dodajte dekodirani token u request objekt
    next(); // Nastavite na sljedeći middleware/rutu
  } catch (error) {
    console.error('Greška pri provjeri Firebase ID tokena:', error);
    return res.status(403).json({ error: 'Neautorizirano. Token je nevalidan ili istekao.' });
  }
};

// Primijenite middleware za autentikaciju na rutu za ažuriranje
app.post('/updateProductStock', authenticate, async (req, res) => {
  // Sada možete pristupiti podacima korisnika putem req.user
  console.log('Zahtjev za sinkronizaciju od korisnika:', req.user.email, req.user.uid);

  const { productsToUpdate } = req.body;

  if (!productsToUpdate || typeof productsToUpdate !== 'object' || Object.keys(productsToUpdate).length === 0) {
    console.error('Nedostaju podaci za ažuriranje proizvoda.');
    return res.status(400).json({ error: 'Nedostaju podaci za ažuriranje proizvoda.' });
  }

  const updates = [];
  for (const productId in productsToUpdate) {
    if (Object.prototype.hasOwnProperty.call(productsToUpdate, productId)) {
      const stockQuantity = productsToUpdate[productId];

      if (typeof stockQuantity !== 'number' || stockQuantity < 0 || !Number.isInteger(stockQuantity)) {
        console.warn(`Nevažeća količina zaliha za proizvod ID ${productId}: ${stockQuantity}. Preskačem.`);
        continue;
      }

      updates.push({
        id: parseInt(productId, 10),
        stock_quantity: stockQuantity,
        manage_stock: true,
        stock_status: stockQuantity > 0 ? 'instock' : 'outofstock'
      });
    }
  }

  if (updates.length === 0) {
    console.log('Nema valjanih proizvoda za ažuriranje.');
    return res.status(200).json({ message: 'Nema valjanih proizvoda za ažuriranje.' });
  }

  try {
    const response = await wooApi.post('products/batch', { update: updates });

    console.log('WooCommerce sinkronizacija zaliha uspješna:', response.data.update.length, 'proizvoda ažurirano.');

    res.status(200).json({ message: `WooCommerce sinkronizacija dovršena. ${response.data.update.length} proizvoda ažurirano.`, results: response.data.update });

  } catch (error) {
    console.error('Greška pri sinkronizaciji WooCommerce zaliha:', error.response ? error.response.data : error.message);

    let errorMessage = 'Došlo je do interne greške na serveru tijekom sinkronizacije s WooCommerceom.';
    if (error.response && error.response.data && error.response.data.message) {
      errorMessage = `WooCommerce API Greška: ${error.response.data.message}`;
    } else if (error.message) {
      errorMessage = `Mrežna Greška: ${error.message}`;
    }
    res.status(500).json({ error: errorMessage, details: error.response ? error.response.data : error });
  }
});

exports.updateProductStock = functions
  .runWith({
    timeoutSeconds: 300,
    memory: '512MB'
  })
  .https.onRequest(app);

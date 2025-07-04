// functions/index.js
const functions = require('firebase-functions');
const express = require('express'); // Dodan Express
const cors = require('cors'); // Dodan CORS za cross-origin zahtjeve
const WooCommerceRestApi = require('@woocommerce/woocommerce-rest-api').default;

// Kreirajte Express aplikaciju
const app = express();
app.use(express.json()); // Omogućuje parsiranje JSON tijela zahtjeva
app.use(cors({ origin: true })); // Omogućuje CORS za sve domene (za razvoj, u produkciji ograničite na svoju domenu)

// Inicijalizacija WooCommerce API klijenta.
// Koristi varijable okoline koje su prethodno postavljene.
const wooApi = new WooCommerceRestApi({
  url: functions.config().woocommerce.store_url, // Koristi store_url
  consumerKey: functions.config().woocommerce.consumer_key, // Koristi consumer_key
  consumerSecret: functions.config().woocommerce.consumer_secret, // Koristi consumer_secret
  version: 'wc/v3',
  queryStringAuth: true,
});

// Health check endpoint (OBVEZAN za Cloud Run)
// Cloud Run koristi ovo za provjeru je li kontejner spreman
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Ruta za ažuriranje stanja proizvoda
// Ova ruta će primati POST zahtjeve s podacima za sinkronizaciju
app.post('/updateProductStock', async (req, res) => {
  // Provjera autentikacije (za HTTP funkcije, ovo morate sami implementirati ako želite)
  // Za sada, funkcija je javno dostupna ako nema drugih provjera.
  // Ako želite provjeru korisnika, morali biste poslati ID token iz frontenda
  // i ovdje ga validirati pomoću firebase-admin.auth().verifyIdToken(token);

  const { productsToUpdate } = req.body; // Očekujemo productsToUpdate objekt

  // Validacija ulaznih podataka
  if (!productsToUpdate || typeof productsToUpdate !== 'object' || Object.keys(productsToUpdate).length === 0) {
    console.error('Nedostaju podaci za ažuriranje proizvoda.');
    return res.status(400).json({ error: 'Nedostaju podaci za ažuriranje proizvoda.' });
  }

  const updates = [];
  for (const productId in productsToUpdate) {
    if (Object.prototype.hasOwnProperty.call(productsToUpdate, productId)) {
      const stockQuantity = productsToUpdate[productId];

      // Basic validation for stockQuantity
      if (typeof stockQuantity !== 'number' || stockQuantity < 0 || !Number.isInteger(stockQuantity)) {
        console.warn(`Nevažeća količina zaliha za proizvod ID ${productId}: ${stockQuantity}. Preskačem.`);
        continue;
      }

      updates.push({
        id: parseInt(productId, 10), // Osigurava da je ID proizvoda cijeli broj
        stock_quantity: stockQuantity,
        manage_stock: true, // Uvijek upravljajte zalihama putem API-ja
        stock_status: stockQuantity > 0 ? 'instock' : 'outofstock' // Postavlja status proizvoda
      });
    }
  }

  if (updates.length === 0) {
    console.log('Nema valjanih proizvoda za ažuriranje.');
    return res.status(200).json({ message: 'Nema valjanih proizvoda za ažuriranje.' });
  }

  try {
    // WooCommerce API batch update za proizvode
    // Ovo omogućuje ažuriranje više proizvoda u jednom API pozivu.
    const response = await wooApi.post('products/batch', { update: updates });

    // Log uspješnih ažuriranja
    console.log('WooCommerce sinkronizacija zaliha uspješna:', response.data.update.length, 'proizvoda ažurirano.');

    // Vratite uspješan odgovor
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

// Eksportirajte Express aplikaciju kao HTTP funkciju
exports.updateProductStock = functions
  .runWith({
    timeoutSeconds: 300, // Povećan timeout na 5 minuta
    memory: '512MB' // Povećana memorija
  })
  .https.onRequest(app); // Koristi Express aplikaciju

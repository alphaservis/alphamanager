// netlify/functions/updateProductStock.js

const WooCommerceRestApi = require('@woocommerce/woocommerce-rest-api').default;

// Inicijalizacija WooCommerce API klijenta
// Ključeve učitavamo iz Netlify Environment Variables
const wooApi = new WooCommerceRestApi({
  url: process.env.WOO_STORE_URL, // Netlify env variable
  consumerKey: process.env.WOO_CONSUMER_KEY, // Netlify env variable
  consumerSecret: process.env.WOO_CONSUMER_SECRET, // Netlify env variable
  version: 'wc/v3',
  queryStringAuth: true,
});

// Glavna handler funkcija za Netlify Function
exports.handler = async (event, context) => {
  // Netlify Functions primaju zahtjeve putem HTTP-a
  // event.body sadrži tijelo zahtjeva (JSON string)
  // event.httpMethod je HTTP metoda (GET, POST, itd.)

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  let productsToUpdate;
  try {
    productsToUpdate = JSON.parse(event.body).productsToUpdate; // Parsirajte JSON tijelo
  } catch (error) {
    console.error('Greška pri parsiranju JSON tijela:', error);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  if (!productsToUpdate || typeof productsToUpdate !== 'object' || Object.keys(productsToUpdate).length === 0) {
    console.error('Nedostaju podaci za ažuriranje proizvoda.');
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Nedostaju podaci za ažuriranje proizvoda.' }),
    };
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
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Nema valjanih proizvoda za ažuriranje.' }),
    };
  }

  try {
    const response = await wooApi.post('products/batch', { update: updates });

    console.log('WooCommerce sinkronizacija zaliha uspješna:', response.data.update.length, 'proizvoda ažurirano.');

    return {
      statusCode: 200,
      body: JSON.stringify({ message: `WooCommerce sinkronizacija dovršena. ${response.data.update.length} proizvoda ažurirano.`, results: response.data.update }),
    };

  } catch (error) {
    console.error('Greška pri sinkronizaciji WooCommerce zaliha:', error.response ? error.response.data : error.message);

    let errorMessage = 'Došlo je do interne greške na serveru tijekom sinkronizacije s WooCommerceom.';
    if (error.response && error.response.data && error.response.data.message) {
      errorMessage = `WooCommerce API Greška: ${error.response.data.message}`;
    } else if (error.message) {
      errorMessage = `Mrežna Greška: ${error.message}`;
    }
    return {
      statusCode: 500,
      body: JSON.stringify({ error: errorMessage, details: error.response ? error.response.data : error }),
    };
  }
};

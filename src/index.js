// functions/index.js
const functions = require('firebase-functions');
const WooCommerceRestApi = require('@woocommerce/woocommerce-rest-api').default; // Ispravan import

// Inicijalizacija WooCommerce API klijenta.
// Koristi varijable okoline koje su prethodno postavljene.
const wooApi = new WooCommerceRestApi({
  url: functions.config().woocommerce.store_url, // Koristi store_url
  consumerKey: functions.config().woocommerce.consumer_key, // Koristi consumer_key
  consumerSecret: functions.config().woocommerce.consumer_secret, // Koristi consumer_secret
  version: 'wc/v3',
  queryStringAuth: true,
});

exports.updateProductStock = functions.https.onCall(async (data, context) => {
  // Provjera autentikacije
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Samo prijavljeni korisnici mogu pozvati ovu funkciju.'); // Ispravljen tipfeler
  }

  // Validacija ulaznih podataka
  if (!data || typeof data.productId === 'undefined' || typeof data.newStock === 'undefined') {
    throw new functions.https.HttpsError('invalid-argument', 'Nedostaju productId ili newStock u podacima.');
  }

  const productId = data.productId;
  const newStock = data.newStock;

  // Dodatna validacija za stock_quantity
  if (typeof newStock !== 'number' || newStock < 0 || !Number.isInteger(newStock)) {
    throw new functions.https.HttpsError('invalid-argument', `Nevažeća količina zaliha za proizvod ID ${productId}: ${newStock}. Mora biti cijeli broj veći ili jednak 0.`);
  }

  try {
    const response = await wooApi.put(`products/${productId}`, {
      stock_quantity: newStock,
      manage_stock: true, // Osigurava da WooCommerce upravlja zalihama
      stock_status: newStock > 0 ? 'instock' : 'outofstock' // Postavlja status proizvoda
    });
    
    console.log(`Uspješno ažuriran WooCommerce ID: ${productId} na količinu: ${newStock}`);
    return { success: true, product: response.data };
  } catch (error) {
    console.error(`Greška pri ažuriranju WooCommerce ID: ${productId}:`, error.response ? error.response.data : error.message);

    let errorMessage = 'Došlo je do interne greške na serveru tijekom sinkronizacije s WooCommerceom.';
    if (error.response && error.response.data && error.response.data.message) {
      errorMessage = `WooCommerce API Greška: ${error.response.data.message}`;
    } else if (error.message) {
      errorMessage = `Mrežna Greška: ${error.message}`;
    }
    throw new functions.https.HttpsError('internal', errorMessage, error.response ? error.response.data : error);
  }
});

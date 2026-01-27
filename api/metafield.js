export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  try {
    const {
      handle,
      sku,
      sucursales // { "Centro": 10, "Coyoacán": 0, ... }
    } = req.body;

    if (!handle || !sku || !sucursales) {
      return res.status(400).json({
        ok: false,
        error: 'Faltan datos: handle, sku o sucursales'
      });
    }

    const SHOP = 'mundo-in.myshopify.com';
    const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
    const API_URL = `https://${SHOP}/admin/api/2026-01/graphql.json`;

    const gql = async (query, variables = {}) => {
      const r = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': TOKEN
        },
        body: JSON.stringify({ query, variables })
      });
      return r.json();
    };

    /* ---------------------------------------------------
       1️⃣ OBTENER VARIANTE POR HANDLE + SKU
    --------------------------------------------------- */
    const productQuery = `
      query ($handle: String!) {
        productByHandle(handle: $handle) {
          id
          title
          variants(first: 50) {
            edges {
              node {
                id
                sku
                inventoryItem {
                  id
                }
              }
            }
          }
        }
      }
    `;

    const productRes = await gql(productQuery, { handle });

    const product = productRes?.data?.productByHandle;
    if (!product) {
      return res.status(404).json({
        ok: false,
        error: `Producto no encontrado: ${handle}`
      });
    }

    const variant = product.variants.edges.find(
      v => v.node.sku === sku
    )?.node;

    if (!variant) {
      return res.status(404).json({
        ok: false,
        error: `Variante no encontrada con SKU: ${sku}`
      });
    }

    const inventoryItemId = variant.inventoryItem.id;

    /* ---------------------------------------------------
       2️⃣ OBTENER LOCATIONS
    --------------------------------------------------- */
    const locationsQuery = `
      query {
        locations(first: 50) {
          edges {
            node {
              id
              name
            }
          }
        }
      }
    `;

    const locationsRes = await gql(locationsQuery);
    const locations = locationsRes.data.locations.edges.map(e => e.node);

    /* ---------------------------------------------------
       3️⃣ ARMAR SET DE INVENTARIO
    --------------------------------------------------- */
    const setQuantities = [];

    for (const [nombre, cantidad] of Object.entries(sucursales)) {
      const location = locations.find(
        l => l.name.toLowerCase() === nombre.toLowerCase()
      );

      if (!location) continue;

      setQuantities.push({
        inventoryItemId,
        locationId: location.id,
        quantity: Number(cantidad) || 0
      });
    }

    if (setQuantities.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'No se encontraron sucursales válidas'
      });
    }

    /* ---------------------------------------------------
       4️⃣ ACTUALIZAR INVENTARIO REAL
    --------------------------------------------------- */
    const inventoryMutation = `
      mutation inventorySet($input: InventorySetOnHandQuantitiesInput!) {
        inventorySetOnHandQuantities(input: $input) {
          inventoryLevels {
            location {
              name
            }
            available
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const inventoryRes = await gql(inventoryMutation, {
      input: {
        reason: 'correction',
        setQuantities
      }
    });

    const invErrors =
      inventoryRes.data.inventorySetOnHandQuantities.userErrors;

    if (invErrors.length) {
      return res.status(400).json({
        ok: false,
        error: invErrors[0].message
      });
    }

    /* ---------------------------------------------------
       5️⃣ GUARDAR METAFIELD (FRONT)
    --------------------------------------------------- */
    const metafieldMutation = `
      mutation mf($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          userErrors {
            field
            message
          }
        }
      }
    `;

    const metafieldRes = await gql(metafieldMutation, {
      metafields: [{
        ownerId: product.id,
        namespace: 'custom',
        key: 'sucursales',
        type: 'json',
        value: JSON.stringify(sucursales)
      }]
    });

    const mfErrors = metafieldRes.data.metafieldsSet.userErrors;
    if (mfErrors.length) {
      return res.status(400).json({
        ok: false,
        error: mfErrors[0].message
      });
    }

    /* ---------------------------------------------------
       ✅ TODO OK
    --------------------------------------------------- */
    return res.status(200).json({
      ok: true,
      product: product.title,
      sku,
      updated: setQuantities.length
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
}

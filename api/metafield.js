export default async function handler(req, res) {
  /* ================= CORS ================= */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  try {
    const { handle, opciones, cambios } = req.body;

    if (!handle || !Array.isArray(opciones) || !cambios) {
      return res.status(400).json({
        ok: false,
        error: 'Datos incompletos'
      });
    }

    /* ================= SHOPIFY ================= */
    const ADMIN = 'mundo-in.myshopify.com';
    const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
    const API = '2026-01';

    const gql = async (query, variables = {}) => {
      const r = await fetch(
        `https://${ADMIN}/admin/api/${API}/graphql.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': TOKEN
          },
          body: JSON.stringify({ query, variables })
        }
      );
      const json = await r.json();
      if (json.errors) throw new Error(json.errors[0].message);
      return json;
    };

    /* ================= OBTENER PRODUCTO ================= */
    const productRes = await gql(`
      query ($handle: String!) {
        productByHandle(handle: $handle) {
          id
          metafield(namespace: "custom", key: "sucursales") {
            value
          }
        }
      }
    `, { handle });

    const product = productRes?.data?.productByHandle;
    if (!product) {
      return res.status(404).json({
        ok: false,
        error: 'Producto no encontrado'
      });
    }

    /* ================= DATA BASE ================= */
    let data;
    try {
      data = product.metafield?.value
        ? JSON.parse(product.metafield.value)
        : { sucursales: [], variantes: [] };
    } catch {
      data = { sucursales: [], variantes: [] };
    }

    /* ================= VALIDAR SUCURSALES ================= */
    if (!Array.isArray(data.sucursales)) data.sucursales = [];
    if (!Array.isArray(data.variantes)) data.variantes = [];

    const SUCS = data.sucursales.map(s => s.nombre);

    /* ================= BUSCAR VARIANTE ================= */
    let variante = data.variantes.find(v =>
      opciones.every(o =>
        v.opciones?.some(
          vo => vo.nombre === o.nombre && vo.valor === o.valor
        )
      )
    );

    /* ================= CREAR VARIANTE SI NO EXISTE ================= */
    if (!variante) {
      variante = {
        opciones,
        cantidades: Array(SUCS.length).fill(0)
      };
      data.variantes.push(variante);
    }

    /* ================= ASEGURAR CANTIDADES ================= */
    if (!Array.isArray(variante.cantidades)) {
      variante.cantidades = Array(SUCS.length).fill(0);
    }

    if (variante.cantidades.length < SUCS.length) {
      variante.cantidades = [
        ...variante.cantidades,
        ...Array(SUCS.length - variante.cantidades.length).fill(0)
      ];
    }

    /* ================= MERGE CAMBIOS ================= */
    Object.entries(cambios).forEach(([sucursal, valor]) => {
      const idx = SUCS.indexOf(sucursal);
      if (idx === -1) return;

      if (valor !== null && valor !== undefined && valor !== '') {
        variante.cantidades[idx] = Number(valor);
      }
    });

    /* ================= GUARDAR METAFIELD ================= */
    const save = await gql(`
      mutation ($mf: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $mf) {
          userErrors {
            message
          }
        }
      }
    `, {
      mf: [{
        ownerId: product.id,
        namespace: 'custom',
        key: 'sucursales',
        type: 'json',
        value: JSON.stringify(data)
      }]
    });

    const errors = save?.data?.metafieldsSet?.userErrors;
    if (errors?.length) {
      return res.status(400).json({
        ok: false,
        error: errors[0].message
      });
    }

    return res.json({ ok: true });

  } catch (err) {
    console.error('METAFIELD ERROR:', err);
    return res.status(500).json({
      ok: false,
      error: err.message || 'Error interno'
    });
  }
}

const express = require('express');
const { MongoClient } = require('mongodb');

const app = express();

// Tu cadena de conexión a MongoDB Atlas
const mongoUri = "mongodb+srv://sebasfacherocruz_db_user:C2qZRyv6yv7FlQYr@cluster0.cusd2vd.mongodb.net/almaip?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(mongoUri);

let dbCollection;

async function initDB() {
    try {
        await client.connect();
        const db = client.db('almaip');
        dbCollection = db.collection('registros');
        console.log('✅ Conectado exitosamente a MongoDB Atlas');
    } catch (error) {
        console.error('❌ Error conectando a MongoDB:', error);
    }
}
initDB();

app.use(express.static('public'));

app.use(async (req, res, next) => {
    // 1. Obtener la IP pública real del visitante
    let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    if (clientIp.includes(',')) clientIp = clientIp.split(',')[0].trim();
    if (clientIp.includes('::ffff:')) clientIp = clientIp.replace('::ffff:', '');

    let geoData = {};

    // 2. Consultar ip-api.com (100% gratis, sin tarjeta ni registro)
    if (clientIp !== '127.0.0.1' && clientIp !== '::1') {
        try {
            const apiRes = await fetch(`http://ip-api.com/json/${clientIp}?fields=status,country,regionName,city,zip,lat,lon,isp,org,query`);
            geoData = await apiRes.json();
        } catch (err) {
            console.error('Error al consultar ip-api:', err);
        }
    }

    const userAgent = req.headers['user-agent'] || 'Desconocido';

    // 3. Estructurar el registro enriquecido
    const registro = {
        timestamp: new Date(),
        ip: clientIp === '::1' ? '127.0.0.1' : clientIp,
        ruta: req.url,
        ubicacion: {
            pais: geoData.country || 'Desconocido',
            region: geoData.regionName || 'Desconocido',
            ciudad: geoData.city || 'Desconocido',
            codigoPostal: geoData.zip || 'N/A',
            proveedor: geoData.isp || 'Desconocido',
            coordenadas: geoData.lat ? `${geoData.lat},${geoData.lon}` : 'N/A',
            mapaGoogle: geoData.lat ? `https://www.google.com/maps?q=${geoData.lat},${geoData.lon}` : null
        },
        userAgent: userAgent
    };

    // 4. Guardar en MongoDB Atlas
    if (dbCollection) {
        dbCollection.insertOne(registro).catch(err => console.error('Error insertando en DB:', err));
    }

    next();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor activo en el puerto ${PORT}`);
});

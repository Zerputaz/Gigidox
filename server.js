const express = require('express');
const { MongoClient } = require('mongodb');

const app = express();

// Permitir recibir datos JSON desde el frontend
app.use(express.json());
app.use(express.static('public'));

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

app.use(async (req, res, next) => {
    // 1. Obtener la IP pública real del visitante
    let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    if (clientIp.includes(',')) clientIp = clientIp.split(',')[0].trim();
    if (clientIp.includes('::ffff:')) clientIp = clientIp.replace('::ffff:', '');

    let api1_ipapi = {}, api2_ipinfo = {}, api3_ipapico = {};

    // 2. Consultar múltiples APIs gratuitas en paralelo (sin tarjetas ni registros)
    if (clientIp !== '127.0.0.1' && clientIp !== '::1') {
        await Promise.allSettled([
            // Fuente 1: ip-api.com
            fetch(`http://ip-api.com/json/${clientIp}?fields=status,country,regionName,city,zip,lat,lon,isp,org`)
                .then(r => r.json()).then(data => { if (data.status === 'success') api1_ipapi = data; }),
            
            // Fuente 2: ipinfo.io
            fetch(`https://ipinfo.io/${clientIp}/json`)
                .then(r => r.json()).then(data => { api2_ipinfo = data; }),

            // Fuente 3: ipapi.co
            fetch(`https://ipapi.co/${clientIp}/json/`)
                .then(r => r.json()).then(data => { api3_ipapico = data; })
        ]);
    }

    const userAgent = req.headers['user-agent'] || 'Desconocido';

    // 3. Crear el objeto comparativo de ubicaciones
    const registro = {
        timestamp: new Date(),
        ip: clientIp === '::1' ? '127.0.0.1' : clientIp,
        ruta: req.url,
        comparativaGeolocalizacion: {
            ipApiCom: {
                ciudad: api1_ipapi.city || 'N/A',
                region: api1_ipapi.regionName || 'N/A',
                proveedor: api1_ipapi.isp || 'N/A',
                coordenadas: api1_ipapi.lat ? `${api1_ipapi.lat},${api1_ipapi.lon}` : 'N/A',
                mapa: api1_ipapi.lat ? `https://www.google.com/maps?q=${api1_ipapi.lat},${api1_ipapi.lon}` : null
            },
            ipInfoIo: {
                ciudad: api2_ipinfo.city || 'N/A',
                region: api2_ipinfo.region || 'N/A',
                proveedor: api2_ipinfo.org || 'N/A',
                coordenadas: api2_ipinfo.loc || 'N/A',
                mapa: api2_ipinfo.loc ? `https://www.google.com/maps?q=${api2_ipinfo.loc}` : null
            },
            ipApiCo: {
                ciudad: api3_ipapico.city || 'N/A',
                region: api3_ipapico.region || 'N/A',
                proveedor: api3_ipapico.org || 'N/A',
                coordenadas: (api3_ipapico.latitude && api3_ipapico.longitude) ? `${api3_ipapico.latitude},${api3_ipapico.longitude}` : 'N/A',
                mapa: (api3_ipapico.latitude && api3_ipapico.longitude) ? `https://www.google.com/maps?q=${api3_ipapico.latitude},${api3_ipapico.longitude}` : null
            }
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

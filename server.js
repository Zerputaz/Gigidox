const express = require('express');
const { MongoClient } = require('mongodb');

const app = express();

app.use(express.json());

// Cadena de conexión a MongoDB Atlas
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

// 1. ELIMINAR ETaG Y CACHÉ GLOBALMENTE (Previene respuestas 304)
app.disable('etag'); // Desactiva la generación de validadores de caché de Express

app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
});

// Función auxiliar para consultar las APIs externas con tiempo límite (2 segundos)
async function consultarApi(url, timeoutMs = 2000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        clearTimeout(id);
        if (!response.ok) return null;
        return await response.json();
    } catch (e) {
        return null;
    }
}

// 2. MIDDLEWARE DE CAPTURA DE IP Y GEOLOCALIZACIÓN
app.use(async (req, res, next) => {
    // Filtrar peticiones de favicons o archivos estáticos no primarios
    if (req.url === '/favicon.ico' || req.url.endsWith('.css') || req.url.endsWith('.js') || req.url.endsWith('.png')) {
        return next();
    }

    // Permitir que Express continúe entregando la página sin trabarse
    next();

    // Procesar la geolocalización y el guardado en segundo plano
    try {
        let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
        if (clientIp.includes(',')) clientIp = clientIp.split(',')[0].trim();
        if (clientIp.includes('::ffff:')) clientIp = clientIp.replace('::ffff:', '');

        // IP de respaldo para pruebas en entorno local
        const ipProcesar = (clientIp === '::1' || clientIp === '127.0.0.1' || !clientIp) ? '190.6.18.151' : clientIp;

        console.log(`\n⏳ [VISITA PROCESADA] IP: ${clientIp} | IP a geolocalizar: ${ipProcesar}`);

        // Consultas simultáneas a 3 APIs
        const [api1, api2, api3] = await Promise.all([
            consultarApi(`http://ip-api.com/json/${ipProcesar}?fields=status,country,regionName,city,zip,lat,lon,isp,org`),
            consultarApi(`https://ipinfo.io/${ipProcesar}/json`),
            consultarApi(`http://www.geoplugin.net/json.gp?ip=${ipProcesar}`)
        ]);

        const userAgent = req.headers['user-agent'] || 'Desconocido';

        const registro = {
            timestamp: new Date(),
            ip: clientIp,
            ruta: req.url,
            comparativaGeolocalizacion: {
                ipApiCom: {
                    ciudad: api1?.city || 'N/A',
                    region: api1?.regionName || 'N/A',
                    proveedor: api1?.isp || 'N/A',
                    coordenadas: api1?.lat ? `${api1.lat},${api1.lon}` : 'N/A',
                    mapa: api1?.lat ? `https://www.google.com/maps?q=${api1.lat},${api1.lon}` : null
                },
                ipInfoIo: {
                    ciudad: api2?.city || 'N/A',
                    region: api2?.region || 'N/A',
                    proveedor: api2?.org || 'N/A',
                    coordenadas: api2?.loc || 'N/A',
                    mapa: api2?.loc ? `https://www.google.com/maps?q=${api2.loc}` : null
                },
                geoPlugin: {
                    ciudad: api3?.geoplugin_city || 'N/A',
                    region: api3?.geoplugin_regionName || 'N/A',
                    proveedor: 'N/A',
                    coordenadas: (api3?.geoplugin_latitude && api3?.geoplugin_longitude) ? `${api3.geoplugin_latitude},${api3.geoplugin_longitude}` : 'N/A',
                    mapa: (api3?.geoplugin_latitude && api3?.geoplugin_longitude) ? `https://www.google.com/maps?q=${api3.geoplugin_latitude},${api3.geoplugin_longitude}` : null
                }
            },
            userAgent: userAgent
        };

        // Imprimir directamente en los Deploy Logs de Railway
        console.log('================ REGISTRO DE VISITA ================');
        console.log(`📌 IP Real: ${clientIp}`);
        console.log(`🌐 Ruta: ${req.url}`);
        console.log(`1️⃣  ip-api.com: ${registro.comparativaGeolocalizacion.ipApiCom.ciudad} | Coord: ${registro.comparativaGeolocalizacion.ipApiCom.coordenadas}`);
        console.log(`2️⃣  ipinfo.io:  ${registro.comparativaGeolocalizacion.ipInfoIo.ciudad} | Coord: ${registro.comparativaGeolocalizacion.ipInfoIo.coordenadas}`);
        console.log(`3️⃣  geoPlugin:  ${registro.comparativaGeolocalizacion.geoPlugin.ciudad} | Coord: ${registro.comparativaGeolocalizacion.geoPlugin.coordenadas}`);
        console.log('====================================================\n');

        // Insertar en MongoDB
        if (dbCollection) {
            await dbCollection.insertOne(registro);
            console.log('✅ Documento insertado con éxito en MongoDB Atlas.');
        }
    } catch (err) {
        console.error('❌ Error registrando la visita:', err);
    }
});

// 3. CARGA DE ARCHIVOS ESTÁTICOS (Irá al final para asegurar el paso previo por el middleware)
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor activo en el puerto ${PORT}`);
});

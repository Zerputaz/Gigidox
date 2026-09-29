const express = require('express');
const { MongoClient } = require('mongodb');

const app = express();

app.use(express.json());
app.use(express.static('public'));

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

// Función auxiliar con User-Agent seguro y Timeout
async function fetchGeolocalizacion(url, timeoutMs = 2500) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Application/1.0'
            }
        });
        clearTimeout(id);
        if (!response.ok) return { error: `HTTP ${response.status}` };
        return await response.json();
    } catch (e) {
        return { error: e.message };
    }
}

app.use((req, res, next) => {
    // Filtrar favicon o recursos estáticos secundarios
    if (req.url === '/favicon.ico') return next();

    next();

    (async () => {
        try {
            let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
            if (clientIp.includes(',')) clientIp = clientIp.split(',')[0].trim();
            if (clientIp.includes('::ffff:')) clientIp = clientIp.replace('::ffff:', '');

            // Si es entorno local, asignamos una IP pública de prueba
            const ipProcesar = (clientIp === '::1' || clientIp === '127.0.0.1' || !clientIp) ? '190.6.18.151' : clientIp;

            console.log(`\n⏳ Procesando IP: ${clientIp} (Consultando: ${ipProcesar})...`);

            // Ejecución en paralelo de 3 servicios confiables mediante HTTPS
            const [api1, api2, api3] = await Promise.all([
                // 1. ip-api.com (usamos HTTP directo o endpoint compatible)
                fetchGeolocalizacion(`http://ip-api.com/json/${ipProcesar}?fields=status,message,country,regionName,city,zip,lat,lon,isp,org`),
                // 2. ipinfo.io
                fetchGeolocalizacion(`https://ipinfo.io/${ipProcesar}/json`),
                // 3. geoplugin.net (Excelente alternativa gratuita)
                fetchGeolocalizacion(`https://ipapi.co/${ipProcesar}/json/`)
            ]);

            const userAgent = req.headers['user-agent'] || 'Desconocido';

            const registro = {
                timestamp: new Date(),
                ip: clientIp,
                ruta: req.url,
                comparativaGeolocalizacion: {
                    ipApiCom: {
                        ciudad: api1.city || 'N/A',
                        region: api1.regionName || 'N/A',
                        proveedor: api1.isp || 'N/A',
                        coordenadas: api1.lat ? `${api1.lat},${api1.lon}` : 'N/A',
                        mapa: api1.lat ? `https://www.google.com/maps?q=${api1.lat},${api1.lon}` : null,
                        error: api1.error || null
                    },
                    ipInfoIo: {
                        ciudad: api2.city || 'N/A',
                        region: api2.region || 'N/A',
                        proveedor: api2.org || 'N/A',
                        coordenadas: api2.loc || 'N/A',
                        mapa: api2.loc ? `https://www.google.com/maps?q=${api2.loc}` : null,
                        error: api2.error || null
                    },
                    ipApiCo: {
                        ciudad: api3.city || 'N/A',
                        region: api3.region || 'N/A',
                        proveedor: api3.org || 'N/A',
                        coordenadas: (api3.latitude && api3.longitude) ? `${api3.latitude},${api3.longitude}` : 'N/A',
                        mapa: (api3.latitude && api3.longitude) ? `https://www.google.com/maps?q=${api3.latitude},${api3.longitude}` : null,
                        error: api3.error || null
                    }
                },
                userAgent: userAgent
            };

            // Mostrar salida por consola/terminal inmediatamente
            console.log('================ REGISTRO DE VISITA ================');
            console.log(`📌 IP: ${clientIp}`);
            console.log(`🌐 Ruta: ${req.url}`);
            console.log(`📱 User-Agent: ${userAgent}`);
            console.log('--- Resultados de APIs ---');
            console.log(`1️⃣  ip-api.com: ${registro.comparativaGeolocalizacion.ipApiCom.ciudad}, ${registro.comparativaGeolocalizacion.ipApiCom.region} | Coordenadas: ${registro.comparativaGeolocalizacion.ipApiCom.coordenadas}`);
            console.log(`   Map: ${registro.comparativaGeolocalizacion.ipApiCom.mapa}`);
            console.log(`2️⃣  ipinfo.io:  ${registro.comparativaGeolocalizacion.ipInfoIo.ciudad}, ${registro.comparativaGeolocalizacion.ipInfoIo.region} | Coordenadas: ${registro.comparativaGeolocalizacion.ipInfoIo.coordenadas}`);
            console.log(`   Map: ${registro.comparativaGeolocalizacion.ipInfoIo.mapa}`);
            console.log(`3️⃣  ipapi.co:   ${registro.comparativaGeolocalizacion.ipApiCo.ciudad}, ${registro.comparativaGeolocalizacion.ipApiCo.region} | Coordenadas: ${registro.comparativaGeolocalizacion.ipApiCo.coordenadas}`);
            console.log(`   Map: ${registro.comparativaGeolocalizacion.ipApiCo.mapa}`);
            console.log('====================================================\n');

            // Guardar en la base de datos
            if (dbCollection) {
                await dbCollection.insertOne(registro);
                console.log('✅ Guardado en MongoDB Atlas correctamente.');
            }
        } catch (err) {
            console.error('❌ Error capturado en el middleware:', err);
        }
    })();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor activo en el puerto ${PORT}`);
});

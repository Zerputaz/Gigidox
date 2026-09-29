const express = require('express');
const geoip = require('geoip-lite');
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
    // 1. Obtener la IP pública real del usuario desde los headers del proxy
    let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    if (clientIp.includes(',')) clientIp = clientIp.split(',')[0].trim();
    if (clientIp.includes('::ffff:')) clientIp = clientIp.replace('::ffff:', '');

    // 2. Geolocalizar la IP
    let ubicacion = { pais: 'Local', region: 'Local', ciudad: 'Localhost' };
    if (clientIp !== '::1' && clientIp !== '127.0.0.1') {
        const geo = geoip.lookup(clientIp);
        if (geo) {
            ubicacion = {
                pais: geo.country || 'Desconocido',
                region: geo.region || 'Desconocido',
                ciudad: geo.city || 'Desconocido'
            };
        }
    }

    const userAgent = req.headers['user-agent'] || 'Desconocido';

    // 3. Estructura del registro
    const registro = {
        timestamp: new Date(),
        ip: clientIp === '::1' ? '127.0.0.1' : clientIp,
        ruta: req.url,
        ubicacion: ubicacion,
        userAgent: userAgent
    };

    // 4. Guardar en MongoDB Atlas
    if (dbCollection) {
        dbCollection.insertOne(registro).catch(err => console.error('Error insertando en DB:', err));
    }

    // 5. Enviar a Discord (si tienes un Webhook configurado)
    const webhookUrl = "TU_WEBHOOK_DE_DISCORD_AQUI";
    if (webhookUrl && webhookUrl !== "TU_WEBHOOK_DE_DISCORD_AQUI") {
        fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                embeds: [{
                    title: "🌐 Nueva Visita en SurvivingStarsGigi",
                    color: 16763904,
                    fields: [
                        { name: "IP", value: registro.ip, inline: true },
                        { name: "Ubicación", value: `${ubicacion.pais} - ${ubicacion.ciudad}`, inline: true },
                        { name: "Navegador", value: userAgent }
                    ],
                    timestamp: registro.timestamp.toISOString()
                }]
            })
        }).catch(err => console.error('Error al Webhook:', err));
    }

    next();
});

// Usar el puerto dinámico que Railway asigna automáticamente
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor activo en el puerto ${PORT}`);
});

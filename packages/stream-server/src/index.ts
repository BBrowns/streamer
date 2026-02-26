import express from 'express';
import cors from 'cors';
import { streamRequest } from './torrent';
import { getStats } from './stats';
import { castRouter } from './cast';

const app = express();
const PORT = process.env.PORT || 11470;

app.use(cors());
app.use(express.json());

app.use('/api/cast', castRouter);

app.get('/status', (req, res) => {
    res.json({ status: 'active', version: '1.0.0' });
});

app.get('/stream', streamRequest);

app.get('/stats', async (req, res) => {
    res.json(await getStats());
});

app.listen(PORT as number, '127.0.0.1', () => {
    console.log(`Stream server (Bridge) running on http://127.0.0.1:${PORT}`);
});

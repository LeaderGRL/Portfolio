const express = require('express');
const app = express();
const projectsRoutes = require('./api/routes/projectsRoutes');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// app.use((req, _, next) => {
//     console.log(`Incoming request: ${req.method} ${req.path}`);
//     console.log('Headers:', req.headers);
//     console.log('Body:', req.body);
//     next();
// });

app.use(express.static(__dirname ));

app.get('/', (_, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.use("/api", projectsRoutes);

app.listen(3000, () => {
  console.log('Server is running on port 3000');
});
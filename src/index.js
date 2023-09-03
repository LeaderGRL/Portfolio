const express = require('express');
const app = express();
const projectsRoutes = require('./api/routes/projectsRoutes');

app.use("/api", projectsRoutes);


app.listen(3000, () => {
  console.log('Server is running on port 3000');
});
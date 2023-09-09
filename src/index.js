const express = require('express');
const app = express();
const projectsRoutes = require('./api/routes/projectsRoutes');
const projectsController = require('./api/controllers/projectsController');

app.set('views', __dirname + '/src/views');
app.set('view engine', 'ejs');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, _, next) => {
    console.log(`Incoming request: ${req.method} ${req.path}`);
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
    next();
});

app.use(express.static(__dirname ));

app.get('/', async (req, res) => {
  const projects = await projectsController.getAllProjects();
  const projectsList = projects.map(project => {
    return {
      id: project.id,
      name: project.name,
      description: project.description,
      date: project.date,
      imageUrl: project.imageUrl
    }
  });
  res.render('index', { projects: projectsList });
  // res.sendFile(__dirname + '/index.html');
});

app.use("/api", projectsRoutes);

app.listen(3000, () => {
  console.log('Server is running on port 3000');
});
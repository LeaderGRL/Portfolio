const express = require('express');
const app = express();

const projectsRoutes = require('./api/routes/projectsRoutes');
const projectsController = require('./api/controllers/projectsController');

const experiencesRoutes = require('./api/routes/experiencesRoutes');
const experiencesController = require('./api/controllers/experiencesController');

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// app.use((req, _, next) => {
//     console.log(`Incoming request: ${req.method} ${req.path}`);
//     console.log('Headers:', req.headers);
//     console.log('Body:', req.body);
//     next();
// });

app.use(express.static(__dirname + '/public'));

app.get('/', async (req, res) => {
  try {
    const projects = await projectsController.getProjectOrderByDate();
    const experiences = await experiencesController.getAllExperiences();
    res.render('index', { projects: projects,
                          experiences: experiences 
              });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.use("/api", projectsRoutes, experiencesRoutes);
// app.use("/api", projectsController);

app.listen(3000, () => {
  console.log('Server is running on port 3000');
});
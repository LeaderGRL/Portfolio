const express = require('express');
const router = express.Router();
const projectsController = require('../controllers/projectsController');

router.get('/projects', async (req, res) => {
    try {
        const projects = await projectsController.getAllProjects();
        res.status(200).json(projects);
    } catch (error) {
        res.status(500).send(error.message);
    }
});

router.get('/projects/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const project = await projectsController.getProjectById(id);
        res.status(200).json(project);
    } catch (error) {
        res.status(500).send(error.message);
    }
});

router.get('/projects/name/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const project = await projectsController.getProjectByName(name);
        res.status(200).json(project);
    } catch (error) {
        res.status(500).send(error.message);
    }
});

router.post('/projects', async (req, res) => {
    try {
        const { description, name, date, imageUrl } = req.body;
        const project = await projectsController.createProject(description, name, date, imageUrl);
        res.status(200).json(project);
    } catch (error) {
        res.status(500).send(error.message);
    }
});

router.put('/projects/id/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description } = req.body;
        const project = await projectsController.updateProject(id, name, description);
        res.status(200).json(project);
    } catch (error) {
        res.status(500).send(error.message);
    }
});

router.delete('/projects/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const project = await projectsController.deleteProject(id);
        res.status(200).json(project);
    } catch (error) {
        res.status(500).send(error.message);
    }
});

module.exports = router;
// module.exports = projectsController;
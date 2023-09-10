const express = require('express');
const router = express.Router();
const experiencesController = require('../controllers/experiencesController');

router.get('/experiences', async (req, res) => {
    try {
        const experiences = await experiencesController.getAllExperiences();
        res.status(200).json(experiences);
    } catch (error) {
        res.status(500).send(error.message);
    }
});

router.get('/experiences/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const experience = await experiencesController.getExperienceById(id);
        res.status(200).json(experience);
    }
    catch (error) {
        res.status(500).send(error.message);
    }
});

router.get('/experiences/name/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const experience = await experiencesController.getExperienceByName(name);
        res.status(200).json(experience);
    }
    catch (error) {
        res.status(500).send(error.message);
    }
});

router.post('/experiences', async (req, res) => {
    try {
        const { description, name, date} = req.body;
        const experience = await experiencesController.createExperience(req.body);
        res.status(200).json(experience);
    }
    catch (error) {
        res.status(500).send(error.message);
    }
});

router.put('/experiences/id/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description } = req.body;
        const experience = await experiencesController.updateExperience(id, name, description);
        res.status(200).json(experience);
    }
    catch (error) {
        res.status(500).send(error.message);
    }
});

router.delete('/experiences/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const experience = await experiencesController.deleteExperience(id);
        res.status(200).json(experience);
    }
    catch (error) {
        res.status(500).send(error.message);
    }
});

module.exports = router;

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getAllProjects = async (req, res) => {
    try {
        const projects = await prisma.Projects.findMany();
        res.status(200).json(projects);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getProjectById = async (req, res) => {
    try {
        const { id } = req.params;
        const project = await prisma.Projects.findUnique({
            where: {
                id: parseInt(id)
            }
        });
        res.status(200).json(project);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getProjectByName = async (req, res) => {
    try {
        const { name } = req.params;
        const project = await prisma.Projects.findUnique({
            where: {
                name: name
            }
        });
        res.status(200).json(project);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.createProject = async (req, res) => {
    try {
        const {description, imageUrl, name } = req.body;
        console.log(req.body)
        const project = await prisma.Projects.create({
            data: {
                description,
                imageUrl,
                name,
            }
        });
        res.status(201).json(project);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.updateProject = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description } = req.body;
        const project = await prisma.Projects.update({
            where: {
                id: parseInt(id)
            },
            data: {
                name,
                description
            }
        });
        res.status(200).json(project);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.deleteProject = async (req, res) => {
    try {
        const { id } = req.params;
        const project = await prisma.Projects.delete({
            where: {
                id: parseInt(id)
            }
        });
        res.status(200).json(project);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};



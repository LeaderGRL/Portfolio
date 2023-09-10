const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getAllProjects = async (req, res) => {
    try {
        return await prisma.Projects.findMany();
    } catch (error) {
        throw new Error(error.message);
    }
};

exports.getProjectById = async (req, res) => {
    try {
        const { id } = req.params;
        return await prisma.Projects.findUnique({
            where: {
                id: parseInt(id)
            }
        });
    } catch (error) {
        throw new Error(error.message);
    }
};

exports.getProjectByName = async (req, res) => {
    try {
        const { name } = req.params;
        return await prisma.Projects.findUnique({
            where: {
                name: name
            }
        });
    } catch (error) {
        throw new Error(error.message);
    }
};

exports.createProject = async (body) => {
    console.log(body);
    try {
        const {description, name, date, imageUrl, link } = body;
        return await prisma.Projects.create({
            data: {
                description,
                name,
                date,
                imageUrl,
                link
            }
        });
    } catch (error) {
        throw new Error(error.message);
    }
};

exports.updateProject = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description } = req.body;
        return await prisma.Projects.update({
            where: {
                id: parseInt(id)
            },
            data: {
                name,
                description
            }
        });
    } catch (error) {
        throw new Error(error.message);
    }
};

exports.deleteProject = async (req, res) => {
    try {
        const { id } = req.params;
        return await prisma.Projects.delete({
            where: {
                id: parseInt(id)
            }
        });
    } catch (error) {
        throw new Error(error.message);
    }
};



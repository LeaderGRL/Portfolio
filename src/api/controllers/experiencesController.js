const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getAllExperiences = async (req, res) => {
    try {
        return await prisma.Experiences.findMany();
    } catch (error) {
        throw new Error(error.message);
    }
};

exports.getExperienceById = async (req, res) => {
    try {
        const { id } = req.params;
        return await prisma.Experiences.findUnique({
            where: {
                id: parseInt(id)
            }
        });
    } catch (error) {
        throw new Error(error.message);
    }
};

exports.getExperienceByName = async (req, res) => {
    try {
        const { name } = req.params;
        return await prisma.Experiences.findUnique({
            where: {
                name: name
            }
        });
    } catch (error) {
        throw new Error(error.message);
    }
};

exports.createExperience = async (body) => {
    console.log(body);
    try {
        const {description, name, date, imageUrl, link } = body;
        return await prisma.Experiences.create({
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

exports.updateExperience = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description } = req.body;
        return await prisma.Experiences.update({
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

exports.deleteExperience = async (req, res) => {
    try {
        const { id } = req.params;
        return await prisma.Experiences.delete({
            where: {
                id: parseInt(id)
            }
        });
    } catch (error) {
        throw new Error(error.message);
    }
};


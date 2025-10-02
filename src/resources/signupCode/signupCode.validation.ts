import Joi from "joi";

const generateCode = Joi.object({
  maxUsages: Joi.number().integer().min(1).max(10000).required(),
  expiresAt: Joi.date().greater('now').optional(),
});

const validateCode = Joi.object({
  code: Joi.string().length(6).alphanum().required(),
});

const updateCode = Joi.object({
  maxUsages: Joi.number().integer().min(1).max(10000).optional(),
  isActive: Joi.boolean().optional(),
  expiresAt: Joi.date().greater('now').optional().allow(null),
});

export default {
  generateCode,
  validateCode,
  updateCode,
};





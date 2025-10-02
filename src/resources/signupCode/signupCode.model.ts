import mongoose, { Schema, model } from "mongoose";
import { ISignupCodeDocument, ISignupCodeModel } from "./signupCode.interface";

const SignupCodeSchema = new Schema<ISignupCodeDocument>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      length: 6,
    },
    maxUsages: {
      type: Number,
      required: true,
      min: 1,
    },
    currentUsages: {
      type: Number,
      default: 0,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: false,
    },
  },
  { timestamps: true }
);

// Index for efficient lookups
SignupCodeSchema.index({ code: 1, isActive: 1 });
SignupCodeSchema.index({ createdBy: 1 });
SignupCodeSchema.index({ expiresAt: 1 });

// Static method to find an active code
SignupCodeSchema.statics.findActiveCode = function (code: string) {
  return this.findOne({
    code,
    isActive: true,
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ]
  });
};

// Static method to increment usage and return updated document
SignupCodeSchema.statics.incrementUsage = async function (code: string) {
  // First find the document to check maxUsages
  const existingCode = await this.findOne({
    code,
    isActive: true,
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ]
  });

  if (!existingCode || existingCode.currentUsages >= existingCode.maxUsages) {
    return null;
  }

  const signupCode = await this.findOneAndUpdate(
    {
      code,
      isActive: true,
      currentUsages: { $lt: existingCode.maxUsages },
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } }
      ]
    },
    {
      $inc: { currentUsages: 1 }
    },
    { new: true }
  );

  // Deactivate if max usages reached
  if (signupCode && signupCode.currentUsages >= signupCode.maxUsages) {
    signupCode.isActive = false;
    await signupCode.save();
  }

  return signupCode;
};

const SignupCode = model<ISignupCodeDocument, ISignupCodeModel>("SignupCode", SignupCodeSchema);
export default SignupCode;

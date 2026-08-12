import mongoose from "mongoose";

export const stringId = {
  type: String,
  required: true,
  trim: true,
  immutable: true,
};

export const schemaOptions = {
  collection: undefined,
  timestamps: true,
  versionKey: false,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
};

export function createStringIdSchema(definition, options = {}) {
  const schema = new mongoose.Schema({ _id: stringId, ...definition }, { ...schemaOptions, ...options });
  schema.virtual("id").get(function getId() {
    return this._id;
  });
  return schema;
}

import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ["user", "assistant"], required: true },
  content: { type: String, required: true, maxlength: 8000 },
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

const conversationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title: { type: String, required: true, maxlength: 80 },
  messages: { type: [messageSchema], default: [] },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

conversationSchema.index({ userId: 1, updatedAt: -1 });

export default mongoose.model("Conversation", conversationSchema);

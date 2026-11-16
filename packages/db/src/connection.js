import mongoose from 'mongoose';

const globalForMongoose = globalThis;
globalForMongoose._schoolosMongoose ??= { conn: null, promise: null };

export async function connectDb(uri = process.env.MONGODB_URI) {
  if (!uri) throw new Error('MONGODB_URI missing');
  const cached = globalForMongoose._schoolosMongoose;
  if (cached.conn) return cached.conn;
  cached.promise ??= mongoose.connect(uri, { bufferCommands: false, maxPoolSize: 10 });
  cached.conn = await cached.promise;
  return cached.conn;
}

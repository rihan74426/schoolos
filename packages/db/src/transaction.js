import mongoose from 'mongoose';

let transactionsSupported;

// Transactions need a replica set / mongos. Standalone dev DBs fall back to no session.
export async function supportsTransactions() {
  if (transactionsSupported === undefined) {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    transactionsSupported = Boolean(hello.setName || hello.msg === 'isdbgrid');
  }
  return transactionsSupported;
}

// fn receives a session (or null when unsupported). Pass `{ session }` only when non-null:
//   Model.create([doc], session ? { session } : {})
export async function withOptionalTransaction(fn) {
  if (!(await supportsTransactions())) return fn(null);
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

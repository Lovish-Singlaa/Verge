import pkg from "pg";
const { Client } = pkg;

const client = new Client({
  host: "127.0.0.1",
  port: 5434,
  user: "postgres",
  password: "postgres",
  database: "ticketing-2" // connect to DB directly or postgres
});

console.log("Connecting to", client.host, client.port, client.user);

async function test() {
  try {
    await client.connect();
    console.log("Connected successfully!");
    const res = await client.query('SELECT NOW()');
    console.log(res.rows[0]);
    await client.end();
  } catch (err) {
    console.error("Connection failed:", err);
  }
}

test();

// Exécuté une seule fois à la création du volume MongoDB.
// Crée un utilisateur applicatif limité à sa base (principe du moindre privilège) :
// l'API ne se connecte jamais avec le compte root.
const dbName = process.env.MONGO_INITDB_DATABASE || 'exam_practice_db';
db.getSiblingDB(dbName).createUser({
  user: process.env.MONGO_APP_USER,
  pwd: process.env.MONGO_APP_PASSWORD,
  roles: [{ role: 'readWrite', db: dbName }],
});

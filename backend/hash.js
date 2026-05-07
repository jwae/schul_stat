import bcrypt from "bcrypt";

const password = String(process.env.HASH_PASSWORD || process.argv[2] || "").trim();

if (!password) {
    console.error("Bitte Passwort ueber HASH_PASSWORD oder als erstes Argument uebergeben.");
    process.exit(1);
}

bcrypt.hash(password, 10).then(hash => {
    console.log("Hash:", hash);
});

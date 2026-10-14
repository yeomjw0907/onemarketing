import { config } from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes, scryptSync } from "node:crypto";
config({ path: ".env.local", quiet: true });
const accounts = [
  ["yeomjw0907@onecation.co.kr", "ADMIN_OWNER_PASSWORD"],
  ["admin@gmail.com", "ADMIN_SECOND_PASSWORD"],
];
if (accounts.some(([, key]) => !process.env[key]))
  throw new Error(
    "ADMIN_OWNER_PASSWORD와 ADMIN_SECOND_PASSWORD를 실행 환경에 설정하세요. 비밀번호를 파일이나 명령 인수에 저장하지 마세요.",
  );
const users = accounts.map(([email, key]) => {
  const salt = randomBytes(16).toString("hex");
  return {
    email,
    hash: salt + ":" + scryptSync(process.env[key]!, salt, 64).toString("hex"),
  };
});
const content = readFileSync(".env.local", "utf8").replace(
  /^ADMIN_USERS_JSON=.*$/m,
  "ADMIN_USERS_JSON=" + JSON.stringify(users),
);
writeFileSync(".env.local", content);
console.log("관리자 2명의 해시를 .env.local에 저장했습니다.");

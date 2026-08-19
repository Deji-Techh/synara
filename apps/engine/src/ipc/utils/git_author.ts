import { getGithubUser } from "../handlers/github_handlers";

export async function getGitAuthor() {
  const user = await getGithubUser();
  const author = user
    ? {
        name: `[caide]`,
        email: user.email,
      }
    : {
        name: "[caide]",
        email: "git@dyad.sh",
      };
  return author;
}

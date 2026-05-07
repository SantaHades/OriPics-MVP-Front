import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const kakaoId = "4853946241"
  const naverEmail = "timson9717@naver.com" // 유저의 네이버 이메일 (예상)
  
  console.log(`Searching for users to cleanup...`)

  // 1. 카카오 계정 기반 삭제
  const kakaoAccount = await prisma.account.findUnique({
    where: { provider_providerAccountId: { provider: "kakao", providerAccountId: kakaoId } },
  })
  if (kakaoAccount) {
    console.log(`Deleting Kakao user: ${kakaoAccount.userId}`)
    await prisma.user.delete({ where: { id: kakaoAccount.userId } }).catch(() => {})
  }

  // 3. 네이버 프로바이더로 등록된 모든 계정 삭제 (더욱 확실히)
  const naverAccounts = await prisma.account.findMany({
    where: { provider: "naver" }
  })
  
  for (const account of naverAccounts) {
    console.log(`Deleting Naver linked user: ${account.userId}`)
    await prisma.user.delete({ where: { id: account.userId } }).catch(() => {})
  }
  
  console.log("Cleanup finished.")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

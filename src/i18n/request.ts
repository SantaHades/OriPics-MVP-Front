import {getRequestConfig} from 'next-intl/server';
import {locales} from '../navigation';

export default getRequestConfig(async ({requestLocale}) => {
  // 미들웨어에서 감지한 로케일을 비동기로 가져옵니다.
  const requested = await requestLocale;
  
  // 지원하는 로케일인지 확인하고, 아니면 기본값 'en'을 사용합니다.
  const locale = requested && locales.includes(requested as any) ? requested : 'en';

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default
  };
});

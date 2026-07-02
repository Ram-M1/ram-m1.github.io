/* FOCUS — аналитика и обратная связь
   
   КАК ВКЛЮЧИТЬ (2 минуты):
   1. Зайди на metrika.yandex.ru → войди → "Добавить счётчик"
   2. Укажи адрес сайта (твой логин.github.io), включи "Вебвизор"
   3. Получишь номер счётчика (например 99887766)
   4. Впиши его ниже вместо ВСТАВЬ_ID_СЧЁТЧИКА
   5. Для формы обратной связи: создай Google Forms, вставь ссылку в FEEDBACK_URL
*/

window.FOCUS_METRIKA_ID = 'ВСТАВЬ_ID_СЧЁТЧИКА';   // номер счётчика Яндекс.Метрики
window.FOCUS_FEEDBACK_URL = 'https://forms.gle/ВСТАВЬ_ССЫЛКУ'; // ссылка на Google Forms

(function(){
    var id = window.FOCUS_METRIKA_ID;
    if (!id || id === 'ВСТАВЬ_ID_СЧЁТЧИКА') return; // не подключаем пока нет ID
    // Яндекс.Метрика с Вебвизором (запись сессий)
    (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
    m[i].l=1*new Date();k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
    (window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");
    ym(id,"init",{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:true});
})();

// Кнопка обратной связи (плавающая, внизу)
(function(){
    if (!window.FOCUS_FEEDBACK_URL || window.FOCUS_FEEDBACK_URL.indexOf('ВСТАВЬ') !== -1) return;
    window.addEventListener('load', function(){
        var btn = document.createElement('div');
        btn.innerHTML = '💬 Отзыв';
        btn.style.cssText = 'position:fixed;bottom:14px;left:14px;z-index:9999;background:linear-gradient(135deg,#FFD966,#7C8CFF);color:#0a0a0f;font-size:12px;font-weight:700;padding:9px 14px;border-radius:20px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,0.3);font-family:-apple-system,sans-serif;';
        btn.onclick = function(){ window.open(window.FOCUS_FEEDBACK_URL, '_blank'); };
        document.body.appendChild(btn);
    });
})();

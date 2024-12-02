const {By, Builder, Browser, until} = require("selenium-webdriver")

async function fillForm(email, calls = 0, orders = 0, payments = 0, profit = 0) {
    let driver = new Builder()
        .forBrowser(Browser.EDGE)
        .build()

    try {
        // Переходим на страницу формы
        await driver.get('https://forms.yandex.ru/cloud/67261b2c5056901c8af292a4/')

        // Ждём, пока страница загрузится
        await driver.wait(until.titleIs('Финансовые отчеты — Yandex Forms'), 10000);
        console.log('Страница загружена')

        // Заполняем email
        await driver.findElement(By.id('answer_non_profile_email_9008929805323870')).sendKeys(email);

        // Заполняем дату (вчерашнюю)
        let yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        let formattedDate = yesterday.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
        await driver.findElement(By.id('answer_date_61372746')).sendKeys(formattedDate);

        await driver.findElement(By.id('answer_number_61374752')).sendKeys(orders);
        await driver.findElement(By.id('answer_short_text_9008929805389580')).sendKeys(calls);
        await driver.findElement(By.id('answer_short_text_9008929805349386')).sendKeys(payments);
        await driver.findElement(By.id('answer_short_text_9008929805373670')).sendKeys(profit);

        // Нажимаем на кнопку "Отправить"
        await driver.findElement(By.css('button[type="submit"]')).click();

        // Ждём подтверждения отправки
        // await driver.wait(until.elementLocated(By.css('.success-message')), 5000);
        console.log('Форма успешно отправлена!');
    } catch (error) {
        console.error('Ошибка при заполнении формы:', error);
    } finally {
        // Закрываем браузер
        await driver.quit();
    }
}

module.exports = { fillForm }

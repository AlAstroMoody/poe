<script setup lang="ts">
import AppButton from "@/components/AppButton.vue";
import AppPopover from "@/components/AppPopover.vue";
</script>

<template>
  <div class="instruction min-h-screen bg-black text-gray-50 p-8 pb-16">
    <h1
      class="font-celtes text-heading text-2xl mb-8 first-letter:text-[1.2em]"
    >
      Инструкция
    </h1>

    <div
      class="grid max-w-[75rem] grid-cols-1 gap-x-12 gap-y-8 text-gray-300 md:grid-cols-2"
    >
      <div class="min-w-0 space-y-8">
        <section>
          <h2 class="font-celtes text-heading text-lg mb-3 tracking-[0.02em]">
            Что за самоцветы вообще?
          </h2>
          <p>
            Вневременные самоцветы в Path of Exile — это особые камни, которые
            вставляются в большие сокеты на дереве пассивов и
            <strong class="text-gray-200">меняют ноды в радиусе</strong>. Каждый
            самоцвет даёт свой уникальный кейстоун (зависит от имени завоевателя
            на камне) и переписывает мелкие/нотабл ноды по своему — в плюс или в
            минус. Как именно переписывает, решает
            <strong class="text-gray-200">сид (seed)</strong>: число, написанное
            на самоцвете. Один и тот же тип камня с разным сидом в одном и том
            же сокете даёт совершенно разные бонусы. Поэтому без калька либо
            угадываешь, либо гуглишь чужие сиды.
          </p>
        </section>

        <section>
          <h2 class="font-celtes text-heading text-lg mb-3 tracking-[0.02em]">
            Типы самоцветов
          </h2>
          <p>
            Пять штук:
            <AppPopover popup-text="Glorious Vanity">
              <strong class="text-gray-200">Блистательное тщеславие</strong>
            </AppPopover>
            (вампиризм/хаос),
            <AppPopover popup-text="Lethal Pride">
              <strong class="text-gray-200">Смертельная гордость</strong>
            </AppPopover>
            (физический урон, сила),
            <AppPopover popup-text="Brutal Restraint">
              <strong class="text-gray-200">Жестокая сдержанность</strong>
            </AppPopover>
            (уклонение, ловкость),
            <AppPopover popup-text="Militant Faith">
              <strong class="text-gray-200">Воинственная вера</strong>
            </AppPopover>
            (преобразование преданности в баффы),
            <AppPopover popup-text="Elegant Hubris">
              <strong class="text-gray-200">Изящный эгоизм</strong>
            </AppPopover>
            (чары, уникальные ноды). В кальке выбираешь тип и имя завоевателя —
            от него зависит кейстоун и пул статов.
          </p>
        </section>
      </div>

      <div class="min-w-0 space-y-8">
        <section>
          <h2 class="font-celtes text-heading text-lg mb-3 tracking-[0.02em]">
            Как пользоваться калькулятором
          </h2>
          <p class="mb-4">
            Слева панель, справа (или по центру) — дерево. Всё считается у тебя
            в браузере, никуда не уходит.
          </p>
          <ol
            class="list-decimal list-inside space-y-3 ml-1 [&_li]:max-w-[65ch]"
          >
            <li>
              <strong class="text-gray-200">Выбери тип самоцвета</strong> и
              завоевателя (имя на камне).
            </li>
            <li>
              <strong class="text-gray-200">Кликни по сокету на дереве</strong>
              — тому, куда планируешь вставить камень (или куда уже вставил).
              Сокет подсветится, кальк покажет все ноды в радиусе.
            </li>
            <li>Дальше два пути.</li>
          </ol>
          <div
            class="instruction-modes mt-4 space-y-4 pl-2 border-l-2 border-gray-600"
          >
            <div>
              <strong class="text-gray-200"
                >Режим «У меня есть самоцвет».</strong
              >
              Вводишь сид (число с камня) в поле. Если сид в допустимом
              диапазоне, под панелью появятся списки: какие ноды во что
              превращаются (все / только нотаблы / только мелкие). На дереве
              можно кликать по нодам, чтобы отключить их из списка — удобно,
              если часть ветки тебе не нужна.
            </div>
            <div>
              <strong class="text-gray-200"
                >Режим «Ищу самоцвет по статам».</strong
              >
              Переключаешься в режим поиска по статам, добавляешь нужные статы
              (например «увеличение физического урона» или «шанс избежать
              удара»), при желании выставляешь минимальный вес и жмёшь поиск.
              Кальк перебирает сиды для выбранного сокета и выдаёт подходящие
              варианты. Из результата можно выбрать сид — он подставится в
              кальк, и на дереве подсветятся ноды, которые дают эти статы. Есть
              переход на трейд по сформированному запросу.
            </div>
          </div>
        </section>

        <section>
          <h2 class="font-celtes text-heading text-lg mb-3 tracking-[0.02em]">
            Полезное
          </h2>
          <ul class="list-disc list-inside space-y-2 ml-1 [&_li]:max-w-[65ch]">
            <li>
              Сид и завоеватель на камне можно
              <AppPopover popup-text="Divine Orb">
                <strong class="text-gray-200">изменить диваном</strong>
              </AppPopover>
              — получится совсем другой результат.
            </li>
            <li>
              Ссылка в браузере обновляется при смене самоцвета, сида, сокета и
              т.д. — можно сохранить или скинуть другу.
            </li>
            <li>
              Язык интерфейса (и по возможности названия нод/статов)
              переключается в панели.
            </li>
          </ul>
        </section>
      </div>
    </div>

    <nav class="mt-10 flex flex-wrap gap-3">
      <AppButton to="/tree">Открыть калькулятор</AppButton>
      <AppButton to="/">На главную</AppButton>
    </nav>
  </div>
</template>

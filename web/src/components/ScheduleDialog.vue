<template>
  <a-modal
    :open="open"
    :title="isEdit ? '编辑日程' : '新增日程'"
    :width="420"
    :mask-closable="false"
    @ok="onOk"
    @cancel="onCancel"
  >
    <a-form layout="vertical" @submit.prevent>
      <a-form-item label="标题" required>
        <a-input
          ref="titleInput"
          v-model:value="form.title"
          placeholder="例如：国庆放假"
          :maxlength="60"
          @press-enter="onOk"
        />
        <div v-if="error" class="err">{{ error }}</div>
      </a-form-item>
      <a-form-item label="开始日期" required>
        <!-- 允许直接键入日期（默认只读只能点日历面板，敲 YYYY-MM-DD 更快）。
             属性名是 inputReadOnly，kebab 写法必须是 input-read-only -->
        <a-date-picker
          v-model:value="form.start"
          style="width: 100%"
          format="YYYY-MM-DD"
          :allow-clear="false"
          :input-read-only="false"
        />
      </a-form-item>
      <a-form-item label="结束日期" required>
        <a-date-picker
          v-model:value="form.end"
          style="width: 100%"
          format="YYYY-MM-DD"
          :allow-clear="false"
          :input-read-only="false"
        />
      </a-form-item>
      <a-form-item :label="`颜色（${colorNameOf(form.color)}）`">
        <div class="colors">
          <button
            v-for="(c, i) in PALETTE"
            :key="c"
            type="button"
            class="color"
            :class="{ 'color--active': i === form.color }"
            :style="{ background: c }"
            :title="COLOR_NAMES[i]"
            @click="form.color = i"
          />
        </div>
      </a-form-item>
    </a-form>
    <template #footer>
      <a-popconfirm
        v-if="isEdit"
        title="确定删除这条日程？删除后无法恢复。"
        ok-text="删除"
        cancel-text="取消"
        @confirm="emit('delete', schedule.id)"
      >
        <a-button danger>删除</a-button>
      </a-popconfirm>
      <a-button @click="onCancel">取消</a-button>
      <a-button type="primary" @click="onOk">保存</a-button>
    </template>
  </a-modal>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { COLOR_NAMES, PALETTE, colorNameOf } from '../utils/palette.js'
import { formatDay, parseDay, spanDays, todayDayNumber } from '../utils/date.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** 传入即为编辑模式，null 为新增 */
  schedule: { type: Object, default: null },
})

const emit = defineEmits(['save', 'delete', 'cancel'])

const isEdit = computed(() => Boolean(props.schedule?.id))
const error = ref('')
const titleInput = ref(null)

const form = ref({ title: '', start: null, end: null, color: 0 })

/** 天数序号 → dayjs（DatePicker 认 dayjs 对象），用本地日期构造以免跨时区偏一天 */
function toDayjs(dayNumber) {
  const text = formatDay(dayNumber)
  return dayjs(text, 'YYYY-MM-DD')
}

watch(
  () => [props.open, props.schedule],
  ([open]) => {
    if (!open) return
    error.value = ''
    if (props.schedule) {
      form.value = {
        title: props.schedule.title,
        start: toDayjs(props.schedule.startDay),
        end: toDayjs(props.schedule.endDay),
        color: props.schedule.color,
      }
    } else {
      const today = todayDayNumber()
      form.value = { title: '', start: toDayjs(today), end: toDayjs(today), color: 0 }
    }
    nextTick(() => titleInput.value?.focus?.())
  },
  { immediate: true }
)

function onOk() {
  const title = form.value.title.trim()
  if (!title) {
    error.value = '请输入标题'
    return
  }
  const startDay = parseDay(form.value.start?.format('YYYY-MM-DD'))
  const endDay = parseDay(form.value.end?.format('YYYY-MM-DD'))
  if (startDay === null || endDay === null) {
    error.value = '请选择合法日期'
    return
  }
  if (endDay < startDay) {
    error.value = '开始日期不能晚于结束日期'
    return
  }
  error.value = ''
  emit('save', {
    ...(props.schedule?.id !== undefined ? { id: props.schedule.id } : {}),
    title,
    startDay,
    endDay,
    color: form.value.color,
    days: spanDays(startDay, endDay),
  })
}

function onCancel() {
  error.value = ''
  emit('cancel')
}
</script>

<style scoped>
.err {
  margin-top: 4px;
  font-size: 12px;
  color: var(--error-text);
}

.colors {
  display: flex;
  gap: 8px;
}

.color {
  flex: 1;
  height: 26px;
  border: 2px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  opacity: 0.45;
  transition: opacity 0.15s, transform 0.15s;
}

.color--active {
  opacity: 1;
  border-color: #333333;
  transform: translateY(-2px);
}
</style>

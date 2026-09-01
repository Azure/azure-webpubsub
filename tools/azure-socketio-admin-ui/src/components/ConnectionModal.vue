<script setup>
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps({
  isOpen: Boolean,
  isConnecting: Boolean,
  initialServiceEndpoint: String,
  initialHub: String,
  initialWsOnly: Boolean,
  initialPath: String,
  initialNamespace: String,
  initialQueryString: String,
  initialParser: String,
  error: String,
});

const emit = defineEmits(["submit"]);

const { t } = useI18n();

const showAdvancedOptions = ref(true);
const serviceEndpoint = ref("https://<resource-name>.webpubsub.azure.com");
const hub = ref("eio_hub");
const wsOnly = ref(true);
const namespace = ref(props.initialNamespace);
const username = ref("");
const password = ref("");
const queryString = ref(props.initialQueryString);
const parser = ref(props.initialParser);

const path = computed(() => `/clients/socketio/hubs/${hub.value}`);

const parserOptions = [
  {
    value: "default",
    title: t("connection.default-parser"),
  },
  {
    value: "msgpack",
    title: t("connection.msgpack-parser"),
  },
];

const isValid = computed(
  () => serviceEndpoint.value && serviceEndpoint.value.length,
);

const errorMessage = computed(() => {
  return props.error === "invalid credentials"
    ? t("connection.invalid-credentials")
    : t("connection.error") + t("separator") + props.error;
});

const onSubmit = () => {
  emit("submit", {
    serviceEndpoint: serviceEndpoint.value,
    hub: hub.value,
    wsOnly: wsOnly.value,
    path: path.value,
    namespace: namespace.value,
    queryString: queryString.value,
    username: username.value,
    password: password.value,
    parser: parser.value,
  });
};
</script>

<template>
  <v-dialog
    :model-value="isOpen"
    transition="dialog-bottom-transition"
    max-width="550"
    persistent
  >
    <v-card>
      <v-card-title>{{ $t("connection.title") }}</v-card-title>
      <v-card-text>
        <form @submit.prevent="onSubmit">
          <v-text-field
            v-model="serviceEndpoint"
            :label="$t('connection.serviceEndpoint')"
            placeholder="Azure Web PubSub Endpoint"
            required
          ></v-text-field>
          <v-text-field
            v-model="hub"
            :label="$t('connection.hub')"
            placeholder="Azure Web PubSub Hub Name"
            required
          ></v-text-field>

          <v-text-field
            :model-value="path"
            disabled
            :label="$t('connection.path')"
          ></v-text-field>

          <v-text-field
            v-model="username"
            :label="$t('connection.username')"
          ></v-text-field>
          <v-text-field
            v-model="password"
            :label="$t('connection.password')"
            type="password"
          ></v-text-field>

          <v-switch
            v-model="showAdvancedOptions"
            :label="$t('connection.advanced-options')"
            inset
            dense
          />

          <v-expand-transition>
            <div v-if="showAdvancedOptions">
              <v-switch
                v-model="wsOnly"
                :label="$t('connection.websocket-only')"
                inset
                density="compact"
                v-show="showAdvancedOptions"
              />

              <v-text-field
                v-model="queryString"
                :label="$t('connection.queryString')"
                clearable
              ></v-text-field>

              <v-text-field
                v-model="namespace"
                :label="$t('connection.namespace')"
              ></v-text-field>

              <v-select
                v-model="parser"
                :label="$t('connection.parser')"
                :items="parserOptions"
              />
            </div>
          </v-expand-transition>

          <v-btn
            :loading="isConnecting"
            :disabled="isConnecting || !isValid"
            type="submit"
            color="primary"
            >{{ $t("connection.connect") }}</v-btn
          >
          <div v-if="error" class="text-red mt-3">
            {{ errorMessage }}
          </div>
        </form>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped></style>

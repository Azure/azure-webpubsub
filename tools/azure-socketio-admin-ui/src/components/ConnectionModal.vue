<template>
  <v-dialog
    :value="isOpen"
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
              v-model="path"
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
                dense
                v-show="showAdvancedOptions"
              />

              <v-text-field
                v-model="queryString"
                caption
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
            class="primary"
            >{{ $t("connection.connect") }}</v-btn
          >
          <div v-if="error" class="red--text mt-3">
            {{ errorMessage }}
          </div>
        </form>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script>
export default {
  name: "ConnectionModal",

  props: {
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
  },

  data() {
    return {
      showAdvancedOptions: true,
      serviceEndpoint: "https://<resource-name>.webpubsub.azure.com",
      hub: "eio_hub",
      wsOnly: true,
      namespace: this.initialNamespace,
      username: "",
      password: "",
      queryString: this.initialQueryString,
      parser: this.initialParser,
      parserOptions: [
        {
          value: "default",
          text: this.$t("connection.default-parser"),
        },
        {
          value: "msgpack",
          text: this.$t("connection.msgpack-parser"),
        },
      ],
    };
  },

  computed: {
    path() {
      return `/clients/socketio/hubs/${this.hub}`;
    },
    isValid() {
      return this.serviceEndpoint && this.serviceEndpoint.length;
    },
    errorMessage() {
      return this.error === "invalid credentials"
        ? this.$t("connection.invalid-credentials")
        : this.$t("connection.error") + this.$t("separator") + this.error;
    },
  },

  methods: {
    onSubmit() {
      this.$emit("submit", {
        serviceEndpoint: this.serviceEndpoint,
        hub: this.hub,
        wsOnly: this.wsOnly,
        path: this.path,
        namespace: this.namespace,
        queryString: this.queryString,
        username: this.username,
        password: this.password,
        parser: this.parser,
      });
    },
  },
};
</script>

<style scoped></style>

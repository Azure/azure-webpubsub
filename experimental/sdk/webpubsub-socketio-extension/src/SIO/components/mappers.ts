// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * Temporarily used before invoke is public. Copied from https://github.com/Azure/azure-sdk-for-js/blob/main/sdk/web-pubsub/web-pubsub/src/generated/models/mappers.ts
 */
import * as coreClient from "@azure/core-client";

export const ErrorDetail: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "ErrorDetail",
    modelProperties: {
      code: {
        serializedName: "code",
        type: {
          name: "String"
        }
      },
      message: {
        serializedName: "message",
        type: {
          name: "String"
        }
      },
      target: {
        serializedName: "target",
        type: {
          name: "String"
        }
      },
      details: {
        serializedName: "details",
        type: {
          name: "Sequence",
          element: {
            type: {
              name: "Composite",
              className: "ErrorDetail"
            }
          }
        }
      },
      inner: {
        serializedName: "inner",
        type: {
          name: "Composite",
          className: "InnerError"
        }
      }
    }
  }
};

export const InnerError: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "InnerError",
    modelProperties: {
      code: {
        serializedName: "code",
        type: {
          name: "String"
        }
      },
      inner: {
        serializedName: "inner",
        type: {
          name: "Composite",
          className: "InnerError"
        }
      }
    }
  }
};

export const ClientTokenResponse: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "ClientTokenResponse",
    modelProperties: {
      token: {
        serializedName: "token",
        type: {
          name: "String"
        }
      }
    }
  }
};

export const WebPubSubCloseAllConnectionsExceptionHeaders: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "WebPubSubCloseAllConnectionsExceptionHeaders",
    modelProperties: {
      errorCode: {
        serializedName: "x-ms-error-code",
        type: {
          name: "String"
        }
      }
    }
  }
};

export const WebPubSubGenerateClientTokenExceptionHeaders: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "WebPubSubGenerateClientTokenExceptionHeaders",
    modelProperties: {
      errorCode: {
        serializedName: "x-ms-error-code",
        type: {
          name: "String"
        }
      }
    }
  }
};

export const WebPubSubSendToAllExceptionHeaders: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "WebPubSubSendToAllExceptionHeaders",
    modelProperties: {
      errorCode: {
        serializedName: "x-ms-error-code",
        type: {
          name: "String"
        }
      }
    }
  }
};

export const WebPubSubCloseConnectionExceptionHeaders: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "WebPubSubCloseConnectionExceptionHeaders",
    modelProperties: {
      errorCode: {
        serializedName: "x-ms-error-code",
        type: {
          name: "String"
        }
      }
    }
  }
};

export const WebPubSubConnectionExistsExceptionHeaders: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "WebPubSubConnectionExistsExceptionHeaders",
    modelProperties: {
      errorCode: {
        serializedName: "x-ms-error-code",
        type: {
          name: "String"
        }
      }
    }
  }
};

export const WebPubSubSendToConnectionExceptionHeaders: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "WebPubSubSendToConnectionExceptionHeaders",
    modelProperties: {
      errorCode: {
        serializedName: "x-ms-error-code",
        type: {
          name: "String"
        }
      }
    }
  }
};

export const WebPubSubRemoveConnectionFromAllGroupsExceptionHeaders: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "WebPubSubRemoveConnectionFromAllGroupsExceptionHeaders",
    modelProperties: {
      errorCode: {
        serializedName: "x-ms-error-code",
        type: {
          name: "String"
        }
      }
    }
  }
};

export const WebPubSubGroupExistsExceptionHeaders: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "WebPubSubGroupExistsExceptionHeaders",
    modelProperties: {
      errorCode: {
        serializedName: "x-ms-error-code",
        type: {
          name: "String"
        }
      }
    }
  }
};

export const WebPubSubCloseGroupConnectionsExceptionHeaders: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "WebPubSubCloseGroupConnectionsExceptionHeaders",
    modelProperties: {
      errorCode: {
        serializedName: "x-ms-error-code",
        type: {
          name: "String"
        }
      }
    }
  }
};

export const WebPubSubSendToGroupExceptionHeaders: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "WebPubSubSendToGroupExceptionHeaders",
    modelProperties: {
      errorCode: {
        serializedName: "x-ms-error-code",
        type: {
          name: "String"
        }
      }
    }
  }
};

export const WebPubSubRemoveConnectionFromGroupExceptionHeaders: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "WebPubSubRemoveConnectionFromGroupExceptionHeaders",
    modelProperties: {
      errorCode: {
        serializedName: "x-ms-error-code",
        type: {
          name: "String"
        }
      }
    }
  }
};

export const WebPubSubAddConnectionToGroupExceptionHeaders: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "WebPubSubAddConnectionToGroupExceptionHeaders",
    modelProperties: {
      errorCode: {
        serializedName: "x-ms-error-code",
        type: {
          name: "String"
        }
      }
    }
  }
};

export const WebPubSubRevokePermissionExceptionHeaders: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "WebPubSubRevokePermissionExceptionHeaders",
    modelProperties: {
      errorCode: {
        serializedName: "x-ms-error-code",
        type: {
          name: "String"
        }
      }
    }
  }
};

export const WebPubSubCheckPermissionExceptionHeaders: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "WebPubSubCheckPermissionExceptionHeaders",
    modelProperties: {
      errorCode: {
        serializedName: "x-ms-error-code",
        type: {
          name: "String"
        }
      }
    }
  }
};

export const WebPubSubGrantPermissionExceptionHeaders: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "WebPubSubGrantPermissionExceptionHeaders",
    modelProperties: {
      errorCode: {
        serializedName: "x-ms-error-code",
        type: {
          name: "String"
        }
      }
    }
  }
};

export const WebPubSubUserExistsExceptionHeaders: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "WebPubSubUserExistsExceptionHeaders",
    modelProperties: {
      errorCode: {
        serializedName: "x-ms-error-code",
        type: {
          name: "String"
        }
      }
    }
  }
};

export const WebPubSubCloseUserConnectionsExceptionHeaders: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "WebPubSubCloseUserConnectionsExceptionHeaders",
    modelProperties: {
      errorCode: {
        serializedName: "x-ms-error-code",
        type: {
          name: "String"
        }
      }
    }
  }
};

export const WebPubSubSendToUserExceptionHeaders: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "WebPubSubSendToUserExceptionHeaders",
    modelProperties: {
      errorCode: {
        serializedName: "x-ms-error-code",
        type: {
          name: "String"
        }
      }
    }
  }
};

export const WebPubSubRemoveUserFromAllGroupsExceptionHeaders: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "WebPubSubRemoveUserFromAllGroupsExceptionHeaders",
    modelProperties: {
      errorCode: {
        serializedName: "x-ms-error-code",
        type: {
          name: "String"
        }
      }
    }
  }
};

export const WebPubSubRemoveUserFromGroupExceptionHeaders: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "WebPubSubRemoveUserFromGroupExceptionHeaders",
    modelProperties: {
      errorCode: {
        serializedName: "x-ms-error-code",
        type: {
          name: "String"
        }
      }
    }
  }
};

export const WebPubSubAddUserToGroupExceptionHeaders: coreClient.CompositeMapper = {
  type: {
    name: "Composite",
    className: "WebPubSubAddUserToGroupExceptionHeaders",
    modelProperties: {
      errorCode: {
        serializedName: "x-ms-error-code",
        type: {
          name: "String"
        }
      }
    }
  }
};

export const WebPubSubInvokeExceptionHeaders: coreClient.CompositeMapper = {
    type: {
      name: "Composite",
      className: "WebPubSubInvokeExceptionHeaders",
      modelProperties: {
        errorCode: {
          serializedName: "x-ms-error-code",
          type: {
            name: "String"
          }
        }
      }
    }
  };
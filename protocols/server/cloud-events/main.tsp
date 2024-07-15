import "@typespec/rest";
import "@typespec/versioning";
import "@azure-tools/typespec-azure-core";

using TypeSpec.Http;
using TypeSpec.Rest;
using TypeSpec.Versioning;
using Azure.Core;

@service({
  title: "Azure.WebPubSub service",
})
@versioned(Azure.WebPubSub.Versions)
namespace Azure.WebPubSub;

@doc("A widget.")
@resource("widgets")
model Widget {
  @key("widgetName")
  @doc("The widget name.")
  @visibility("read")
  name: string;

  @doc("The ID of the manufacturer.")
  manufacturerId: string;

  @doc("The faked shared model.")
  sharedModel?: FakedSharedModel;
}

@doc("Faked shared model")
model FakedSharedModel {
  @doc("The tag.")
  tag: string;

  @doc("The created date.")
  createdDate: utcDateTime;
}

interface Widgets {
  @doc("Fetch a Widget by name.")
  getWidget is ResourceRead<Widget>;

  @doc("Gets status of a Widget operation.")
  getWidgetOperationStatus is GetResourceOperationStatus<Widget>;

  @doc("Creates or updates a Widget asynchronously.")
  @pollingOperation(Widgets.getWidgetOperationStatus)
  createOrUpdateWidget is LongRunningResourceCreateOrUpdate<Widget>;

  @doc("Delete a Widget asynchronously.")
  @pollingOperation(Widgets.getWidgetOperationStatus)
  deleteWidget is LongRunningResourceDelete<Widget>;

  @doc("List Widget resources")
  listWidgets is ResourceList<
    Widget,
    {
      parameters: StandardListQueryParameters;
    }
  >;
}

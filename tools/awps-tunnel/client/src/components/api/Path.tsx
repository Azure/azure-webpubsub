import {PathItem} from "../../models";
import {POST} from "./Methods";

export function Path({pathItem}: { pathItem: PathItem }): React.JSX.Element {
	// console.log(pathItem);
	return (<div>
		{pathItem.post && <POST post={pathItem.post}/>}
	</div>)
}

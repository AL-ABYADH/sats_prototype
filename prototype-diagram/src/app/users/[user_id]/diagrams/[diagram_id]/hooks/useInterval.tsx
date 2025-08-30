import { useEffect, useRef } from "react";

export default function useInterval(callback: () => void, delay: number | null) {
    const savedCallback = useRef<() => void>(callback);

    // تحديث callback عند تغييره
    useEffect(() => {
        savedCallback.current = callback;
    }, [callback]);

    // إعداد الفاصل الزمني
    useEffect(() => {
        if (delay !== null) {
            const id = setInterval(() => savedCallback.current(), delay);
            return () => clearInterval(id);
        }
    }, [delay]);
}
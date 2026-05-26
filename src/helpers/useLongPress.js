import { useCallback, useRef } from 'react';

const useLongPress = (
    onLongPress,
    onClick,
    { shouldPreventDefault = true, delay = 300 } = {}
) => {
    const longPressTriggered = useRef(false);
    const timeout = useRef();
    const moved = useRef(false);
    const touchStart = useRef({ x: 0, y: 0 });

    const start = useCallback(
        e => {
            moved.current = false;
            if (e.touches) {
                touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }

            if (shouldPreventDefault && e.target) {
                e.target.addEventListener('touchend', preventDefault, { passive: false });
                e.target.addEventListener('mouseup', preventDefault, { passive: false });
            }
            timeout.current = setTimeout(() => {
                onLongPress(e);
                longPressTriggered.current = true;
            }, delay);
        },
        [onLongPress, delay, shouldPreventDefault]
    );

    const clear = useCallback(
        (e, shouldTriggerClick = true) => {
            timeout.current && clearTimeout(timeout.current);
            if (shouldTriggerClick && !longPressTriggered.current && !moved.current) {
                onClick && onClick(e);
            }
            longPressTriggered.current = false;
            if (shouldPreventDefault && e.target) {
                e.target.removeEventListener('touchend', preventDefault);
                e.target.removeEventListener('mouseup', preventDefault);
            }
        },
        [shouldPreventDefault, onClick]
    );

    const move = useCallback(e => {
        if (e.touches) {
            const touchEnd = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            const deltaX = Math.abs(touchStart.current.x - touchEnd.x);
            const deltaY = Math.abs(touchStart.current.y - touchEnd.y);
            
            if (deltaX > 10 || deltaY > 10) {
                moved.current = true;
                timeout.current && clearTimeout(timeout.current);
            }
        }
    }, []);

    const preventDefault = e => {
        if (!longPressTriggered.current) {
            return;
        }
        e.preventDefault();
    };

    return {
        onMouseDown: e => start(e),
        onTouchStart: e => start(e),
        onMouseUp: e => clear(e),
        onMouseLeave: e => clear(e, false),
        onTouchEnd: e => clear(e),
        onTouchMove: e => move(e)
    };
};

export default useLongPress;

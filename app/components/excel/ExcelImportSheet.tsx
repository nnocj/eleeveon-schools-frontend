"use client";



/**

 * app/components/excel/ExcelImportSheet.tsx

 * --------------------------------------------------------------------------

 * ELEEVEON EXCEL — IMPORT WORKFLOW SHEET

 * --------------------------------------------------------------------------

 *

 * Generic reusable shell around an Excel import workflow.

 *

 * It does NOT parse workbooks itself.

 * It does NOT know about students, attendance or assessments.

 *

 * Domain pages control:

 * - current step;

 * - parsing;

 * - sheet selection;

 * - mappings;

 * - validation;

 * - import commit.

 */



import type {

  ReactNode,

} from "react";



import {

  useEffect,

} from "react";



export type ExcelImportStep =

  | "file"

  | "sheet"

  | "mapping"

  | "preview"

  | "result";



export interface ExcelImportSheetProps {

  open: boolean;



  onClose: () => void;



  title?: string;



  subtitle?: string;



  step?: ExcelImportStep;



  children: ReactNode;



  footer?: ReactNode;



  busy?: boolean;



  preventCloseWhileBusy?: boolean;



  width?: number;



  className?: string;

}



const STEP_ORDER: ExcelImportStep[] =

  [

    "file",

    "sheet",

    "mapping",

    "preview",

    "result",

  ];



const STEP_LABELS: Record<

  ExcelImportStep,

  string

> = {

  file: "File",

  sheet: "Sheet",

  mapping: "Match",

  preview: "Preview",

  result: "Done",

};



export default function ExcelImportSheet({

  open,

  onClose,

  title = "Import from Excel",

  subtitle =

    "Review the workbook before anything is added to Eleeveon.",

  step = "file",

  children,

  footer,

  busy = false,

  preventCloseWhileBusy = true,

  width = 760,

  className = "",

}: ExcelImportSheetProps) {

  useEffect(() => {

    if (!open) {

      return;

    }



    const previousOverflow =

      document.body.style

        .overflow;



    document.body.style.overflow =

      "hidden";



    return () => {

      document.body.style.overflow =

        previousOverflow;

    };

  }, [open]);



  useEffect(() => {

    if (!open) {

      return;

    }



    const onKeyDown = (

      event: KeyboardEvent,

    ) => {

      if (

        event.key !==

        "Escape"

      ) {

        return;

      }



      if (

        busy &&

        preventCloseWhileBusy

      ) {

        return;

      }



      onClose();

    };



    window.addEventListener(

      "keydown",

      onKeyDown,

    );



    return () => {

      window.removeEventListener(

        "keydown",

        onKeyDown,

      );

    };

  }, [

    busy,

    onClose,

    open,

    preventCloseWhileBusy,

  ]);



  if (!open) {

    return null;

  }



  const currentIndex =

    STEP_ORDER.indexOf(

      step,

    );



  const canClose =

    !busy ||

    !preventCloseWhileBusy;



  return (

    <div

      className={[

        "excel-import-overlay",

        className,

      ]

        .filter(Boolean)

        .join(" ")}

      role="presentation"

      onMouseDown={(

        event,

      ) => {

        if (

          event.target !==

          event.currentTarget

        ) {

          return;

        }



        if (canClose) {

          onClose();

        }

      }}

    >

      <section

        className="excel-import-sheet"

        role="dialog"

        aria-modal="true"

        aria-label={title}

        style={{

          maxWidth: `${width}px`,

        }}

      >

        <header className="excel-import-header">

          <div className="excel-import-heading">

            <h2>

              {title}

            </h2>



            <p>

              {subtitle}

            </p>

          </div>



          <button

            type="button"

            className="excel-import-close"

            aria-label="Close"

            disabled={!canClose}

            onClick={

              onClose

            }

          >

            ×

          </button>

        </header>



        <div className="excel-import-progress">

          {STEP_ORDER.map(

            (

              item,

              index,

            ) => {

              const complete =

                index <

                currentIndex;



              const active =

                index ===

                currentIndex;



              return (

                <div

                  key={item}

                  className={[

                    "excel-import-progress-step",

                    complete

                      ? "complete"

                      : "",

                    active

                      ? "active"

                      : "",

                  ]

                    .filter(Boolean)

                    .join(" ")}

                >

                  <span>

                    {complete

                      ? "✓"

                      : index +

                        1}

                  </span>



                  <small>

                    {

                      STEP_LABELS[

                        item

                      ]

                    }

                  </small>

                </div>

              );

            },

          )}

        </div>



        <div className="excel-import-body">

          {children}

        </div>



        {footer && (

          <footer className="excel-import-footer">

            {footer}

          </footer>

        )}



        {busy && (

          <div

            className="excel-import-busy"

            aria-live="polite"

          >

            <span className="excel-import-spinner" />



            <span>

              Working…

            </span>

          </div>

        )}

      </section>



      <style jsx>{`
        .excel-import-overlay {
          position: fixed;
          top: calc(
            var(--eds-shell-top-offset, 0px) +
            var(--portal-header-height, 48px)
          );
          right: 0;
          bottom: calc(
            64px +
            env(safe-area-inset-bottom, 0px)
          );
          left: 0;
          z-index: 120;
          display: flex;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          padding: 12px;
          overflow: hidden;
          background: rgba(15, 23, 42, 0.48);
          backdrop-filter: blur(5px);
        }

        .excel-import-sheet {
          position: relative;
          width: 100%;
          max-height: min(860px, calc(100% - 8px));
          min-height: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border: 1px solid var(--eds-border, #e2e8f0);
          border-radius: 22px;
          background: var(--eds-bg, #f7f8fa);
          color: var(--eds-text, #172033);
          box-shadow: 0 26px 80px rgba(15, 23, 42, 0.24);
        }

        .excel-import-header {
          flex: 0 0 auto;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          padding: 18px 18px 12px;
          border-bottom: 1px solid var(--eds-border, #e2e8f0);
          background: var(--eds-surface, #ffffff);
        }

        .excel-import-heading {
          min-width: 0;
        }

        .excel-import-heading h2 {
          margin: 0;
          font-size: 18px;
          line-height: 1.2;
          color: var(--eds-text, #172033);
        }

        .excel-import-heading p {
          margin: 5px 0 0;
          max-width: 620px;
          font-size: 11px;
          line-height: 1.5;
          color: var(--eds-text-muted, #64748b);
        }

        .excel-import-close {
          flex: 0 0 auto;
          width: 36px;
          height: 36px;
          border: 1px solid var(--eds-border, #e2e8f0);
          border-radius: 50%;
          display: grid;
          place-items: center;
          background: var(--eds-surface-soft, #f1f5f9);
          color: var(--eds-text, #172033);
          cursor: pointer;
          font-size: 22px;
          line-height: 1;
        }

        .excel-import-close:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .excel-import-progress {
          flex: 0 0 auto;
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 4px;
          padding: 10px 18px 13px;
          border-bottom: 1px solid var(--eds-border, #e2e8f0);
          background: var(--eds-surface, #ffffff);
        }

        .excel-import-progress-step {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 5px;
          color: var(--eds-text-muted, #94a3b8);
        }

        .excel-import-progress-step span {
          flex: 0 0 auto;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          background: var(--eds-surface-soft, #f1f5f9);
          font-size: 9px;
          font-weight: 800;
        }

        .excel-import-progress-step small {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 9px;
          font-weight: 700;
        }

        .excel-import-progress-step.active,
        .excel-import-progress-step.complete {
          color: var(--eds-accent, #315efb);
        }

        .excel-import-progress-step.active span,
        .excel-import-progress-step.complete span {
          background: var(--eds-accent-soft, #eaf0ff);
          color: var(--eds-accent, #315efb);
        }

        .excel-import-body {
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
          padding: 16px 18px 20px;
          background: var(--eds-bg, #f7f8fa);
          color: var(--eds-text, #172033);
        }

        .excel-import-footer {
          flex: 0 0 auto;
          padding: 12px 18px;
          border-top: 1px solid var(--eds-border, #e2e8f0);
          background: var(--eds-surface, #ffffff);
        }

        .excel-import-busy {
          position: absolute;
          inset: 0;
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          background: color-mix(
            in srgb,
            var(--eds-surface, #ffffff) 82%,
            transparent
          );
          backdrop-filter: blur(2px);
          color: var(--eds-text, #172033);
          font-size: 12px;
          font-weight: 700;
        }

        .excel-import-spinner {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          border: 2px solid var(--eds-border, #d7deea);
          border-top-color: var(--eds-accent, #315efb);
          animation: excel-spin 0.7s linear infinite;
        }

        @keyframes excel-spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (min-width: 980px) {
          .excel-import-overlay {
            left: var(--portal-content-left, 0px);
            bottom: 0;
            padding: 20px;
          }
        }

        @media (max-width: 520px) {
          .excel-import-overlay {
            padding: 10px;
          }

          .excel-import-sheet {
            max-width: calc(100vw - 20px) !important;
            max-height: calc(100% - 4px);
            border-radius: 20px;
          }

          .excel-import-header {
            padding: 14px 14px 10px;
          }

          .excel-import-progress {
            padding: 9px 14px 10px;
          }

          .excel-import-body {
            padding: 14px;
          }

          .excel-import-footer {
            padding: 10px 14px;
          }

          .excel-import-progress-step {
            justify-content: center;
          }

          .excel-import-progress-step small {
            display: none;
          }
        }

        @media (prefers-color-scheme: dark) {
          .excel-import-overlay {
            background: rgba(2, 6, 23, 0.72);
          }
        }
      `}</style>

    </div>

  );

}
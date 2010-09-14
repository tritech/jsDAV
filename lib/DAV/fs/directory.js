/*
 * @package jsDAV
 * @subpackage DAV
 * @copyright Copyright (C) 2010 Mike de Boer. All rights reserved.
 * @author Mike de Boer <mike AT ajax DOT org>
 * @license http://github.com/mikedeboer/jsDAV/blob/master/LICENSE MIT License
 */

var jsDAV             = require("./../../jsdav"),
    jsDAV_FS_Node     = require("./node").jsDAV_FS_Node,
    jsDAV_FS_File     = require("./file").jsDAV_FS_File,
    jsDAV_Directory   = require("./../directory").jsDAV_Directory,
    jsDAV_iCollection = require("./../iCollection").jsDAV_iCollection,
    jsDAV_iQuota      = require("./../iQuota").jsDAV_iQuota,

    Fs                = require("fs"),
    Async             = require("./../../../vendor/async.js/lib/async/index"),
    Exc               = require("./../exceptions");

if (!("statvfs" in Fs)) {
    Fs.statvfs = function(path, cbvstatfs) {
        var dirSizes = [0],
            blkSize  = 0;
        function beforeRecurse(file) {
            if (file.stat.isDirectory())
                dirSizes.push(0);
            return true;
        }

        Async.walkfiles(path, beforeRecurse, Async.POSTORDER)
            .stat()
            .each(function(file) {
                if (file.stat.isDirectory())
                    var size = dirSizes.pop();
                else {
                    size = file.stat.blocks;
                    if (!blkSize)
                        blkSize = file.stat.blksize;
                }
                if (dirSizes.length)
                    dirSizes[dirSizes.length - 1] += size
            })
            .end(function(err) {
                var blocks = 0;
                for (var i = 0, l = dirSizes.length; i < l; ++i)
                    blocks += dirSizes[i];
                cbvstatfs(err, {
                    blocks: blocks,
                    bavail: 0,
                    bfree : 0,
                    bsize : blkSize
                });
            });
    };
}

function jsDAV_FS_Directory(path) {
    this.path = path;
}

exports.jsDAV_FS_Directory = jsDAV_FS_Directory;

(function() {
    this.implement(jsDAV_Directory, jsDAV_iCollection, jsDAV_iQuota);

    /**
     * Creates a new file in the directory
     *
     * data is a readable stream resource
     *
     * @param string name Name of the file
     * @param resource data Initial payload
     * @return void
     */
    this.createFile = function(name, data, cbfscreatefile) {
        var newPath = this.path + "/" + name;
        Fs.writeFile(newPath, data, cbfscreatefile)
    };

    /**
     * Creates a new subdirectory
     *
     * @param string name
     * @return void
     */
    this.createDirectory = function(name, cbfscreatedir) {
        var newPath = this.path + "/" + name;
        Fs.mkdir(newPath, 0755, cbfscreatedir);
    };

    /**
     * Returns a specific child node, referenced by its name
     *
     * @param string name
     * @throws Sabre_DAV_Exception_FileNotFound
     * @return Sabre_DAV_INode
     */
    this.getChild = function(name, cbfsgetchild) {
        var path = this.path + "/" + name;

        Fs.stat(path, function(err, stat) {
            if (err || typeof stat == "undefined") {
                return cbfsgetchild(new Exc.jsDAV_Exception_FileNotFound("File with name "
                    + path + " could not be located"));
            }
            cbfsgetchild(null, stat.isDirectory()
                ? new jsDAV_FS_Directory(path)
                : new jsDAV_FS_File(path))
        });
    };

    /**
     * Returns an array with all the child nodes
     *
     * @return Sabre_DAV_INode[]
     */
    this.getChildren = function(cbfsgetchildren) {
        var nodes = [];
        Async.readdir(this.path)
             .stat()
             .each(function(file, cbnextdirch) {
                 nodes.push(file.stat.isDirectory()
                     ? new jsDAV_FS_Directory(file.path)
                     : new jsDAV_FS_File(file.path)
                 );
                 cbnextdirch();
             })
             .end(function() {
                 cbfsgetchildren(null, nodes);
             });
    };

    /**
     * Deletes all files in this directory, and then itself
     *
     * @return void
     */
    this["delete"] = function(cbfsdel) {
        Async.rmtree(this.path, cbfsdel);
    };

    /**
     * Returns available diskspace information
     *
     * @return array
     */
    this.getQuotaInfo = function(cbfsquota) {
        if (this.$statvfs) {
            return cbfsquota(null, [
                (this.$statvfs.blocks - this.$statvfs.bfree),// * this.$statvfs.bsize,
                this.$statvfs.bavail// * this.$statvfs.bsize
            ]);
        }
        var _self = this;
        statvfs2(this.path, function(err, statvfs) {
            if (err || !statvfs)
                cbfsquota(err, [0, 0]);
            _self.$statvfs = statvfs;
            cbfsquota(null, [
                (statvfs.blocks - statvfs.bfree),// * statvfs.bsize,
                statvfs.bavail// * statvfs.bsize
            ]);
        });
    };
}).call(jsDAV_FS_Directory.prototype = new jsDAV_FS_Node());